const Project = require("../models/Project");
const User = require("../models/User");
const extractMentions = require("../utils/extractMentions");
const { sendProjectEmail } = require("../utils/mailService");
const { autoCreateProjectGroup, syncProjectGroupMembers } = require("../utils/chatHelper");
const { createNotification } = require("../utils/notificationHelper"); // ✅ Notifications

/* ================= CREATE PROJECT ================= */
exports.createProject = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { name, description, members = [], type = "Business", status, dueDate, company: bodyCompany } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Project name is required" });
    }

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";

    // ✅ SUPER ADMIN: uses company from request body (selected company in header)
    // ✅ COMPANY OWNER / STAFF: uses their own company
    let companyId;
    if (isAdmin) {
      if (!bodyCompany) {
        return res.status(400).json({ message: "Please select a company from the header before creating a project." });
      }
      companyId = bodyCompany;
    } else {
      if (!req.user.company) {
        return res.status(400).json({ message: "Your account is not assigned to any company. Please contact admin." });
      }
      companyId = req.user.company;
    }

    const allUsers = await User.find();
    const mentionedMembers = extractMentions(description || "", allUsers);

    const project = await Project.create({
      name: name.trim(),
      description: description || "",
      type: type || "Business",
      members: members || [],
      mentionedMembers: mentionedMembers || [],
      status: status || "Active",
      isActive: true,
      dueDate: dueDate || null,
      createdBy: req.user._id,
      company: companyId,
    });

    await project.populate([
      { path: "members", select: "username email role", populate: { path: "role", select: "name" } },
      { path: "createdBy", select: "username email" },
      { path: "company", select: "name" },
    ]);

    if (project.members && project.members.length > 0) {
      project.members.forEach((member) => {
        try { sendProjectEmail(member, project, "create"); } catch (e) { console.error("Email error:", e.message); }
      });
    }

    if (io) {
      try {
        io.to(`org_${req.user.organizationId || "default"}`).emit("projectCreated", { project, message: `New project "${name}" created` });
      } catch (e) { console.error("Socket error:", e.message); }
    }

    // ✅ Notify all project members
    if (members.length > 0) {
      await createNotification(io, {
        userId: members,
        companyId: project.company,
        type: "project",
        action: "created",
        title: "Added to Project",
        message: `You have been added to project "${name}"`,
        refId: project._id,
        refModel: "Project",
        triggeredBy: req.user?._id,
      });
    }

    // ✅ Auto-create a chat group for this project
    try {
      await autoCreateProjectGroup(project);
    } catch (e) { console.error("Chat group creation error:", e.message); }

    res.status(201).json({ message: "Project created successfully", project });
  } catch (err) {
    console.error("❌ Create Project Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ================= GET ALL PROJECTS (FILTER BY COMPANY) ================= */
exports.getProjects = async (req, res) => {
  try {
    const { search, type, company: queryCompany } = req.query;
    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";

    if (!isAdmin && !req.user.company) {
      return res.status(400).json({ message: "Your account is not assigned to any company" });
    }

    let query = {};
    if (isAdmin) {
      // ✅ ADMIN: filter by selected company if provided in query, else show all
      if (queryCompany) {
        query.company = queryCompany;
      }
    } else {
      query.company = req.user.company;
    }

    if (search) query.name = { $regex: search, $options: "i" };
    if (type) query.type = type;

    const projects = await Project.find(query)
      .populate({ path: "members", select: "username email role", populate: { path: "role", select: "name" } })
      .populate("createdBy", "username email")
      .populate("company", "name")
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    console.error("❌ Get Projects Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ================= GET SINGLE PROJECT ================= */
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate({ path: "members", select: "username email role", populate: { path: "role", select: "name" } })
      .populate("mentionedMembers", "username email")
      .populate("createdBy", "username email")
      .populate("company", "name");

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";
    if (!isAdmin && project.company?._id.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "You don't have authority to access this project." });
    }

    res.json(project);
  } catch (err) {
    console.error("❌ Get Project Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ================= GET PROJECT TEAM ================= */
exports.getProjectTeam = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate({
      path: "members",
      select: "_id username name email role",
      populate: { path: "role", select: "name" },
    });

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";
    if (!isAdmin && project.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "You don't have authority to access this project." });
    }

    res.json(project.members || []);
  } catch (err) {
    console.error("❌ Get Team Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ================= UPDATE PROJECT ================= */
exports.updateProject = async (req, res) => {
  try {
    const io = req.app.get("io");
    const project = await Project.findById(req.params.id);

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";

    // ✅ SUPER ADMIN can update any project. Others restricted to their company.
    if (!isAdmin && project.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "You don't have authority to modify this project." });
    }

    const { name, description, type, members, status, dueDate, isActive } = req.body;

    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (type) project.type = type;
    if (members) project.members = members;
    if (status) project.status = status;
    if (dueDate !== undefined) project.dueDate = dueDate;
    if (isActive !== undefined) project.isActive = Boolean(isActive);

    if (description) {
      const allUsers = await User.find();
      project.mentionedMembers = extractMentions(description, allUsers);
    }

    await project.save();
    await project.populate([
      { path: "members", select: "username email role", populate: { path: "role", select: "name" } },
      { path: "createdBy", select: "username email" },
      { path: "company", select: "name" },
    ]);

    if (project.members && project.members.length > 0) {
      project.members.forEach((member) => {
        try { sendProjectEmail(member, project, "update"); } catch (e) { console.error("Email error:", e.message); }
      });
    }

    if (io) {
      io.to(`org_${req.user.organizationId || "default"}`).emit("projectUpdated", { project, message: `Project "${project.name}" updated` });
    }

    res.json({ message: "Project updated", project });
  } catch (err) {
    console.error("❌ Update Project Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ================= DELETE PROJECT ================= */
exports.deleteProject = async (req, res) => {
  try {
    const io = req.app.get("io");
    const project = await Project.findById(req.params.id);

    if (!project) return res.status(404).json({ message: "Project not found" });

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";

    // ✅ SUPER ADMIN can delete any project. Others restricted to their company.
    if (!isAdmin && project.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "You don't have authority to delete this project." });
    }

    const projectName = project.name;
    await Project.findByIdAndDelete(req.params.id);

    if (io) {
      try {
        io.to(`org_${req.user.organizationId || "default"}`).emit("projectDeleted", {
          projectId: req.params.id,
          projectName,
          message: `Project "${projectName}" has been deleted`,
        });
      } catch (e) { console.error("Socket error:", e.message); }
    }

    res.json({ message: "Project deleted" });
  } catch (err) {
    console.error("❌ Delete Project Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};
