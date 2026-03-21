const Project = require("../models/Project");
const User = require("../models/User");
const extractMentions = require("../utils/extractMentions");
const { sendProjectEmail } = require("../utils/mailService");

/* ================= CREATE PROJECT ================= */
exports.createProject = async (req, res) => {
  try {
    console.log("🚀 Creating project...");
    console.log("User:", req.user._id);
    console.log("User Company:", req.user.company);

    const io = req.app.get("io");
    const { name, description, members = [], type = "Business", status, dueDate } = req.body;

    // ✅ VALIDATE PROJECT NAME
    if (!name || name.trim() === "") {
      console.log("❌ Project name is empty");
      return res.status(400).json({ message: "Project name is required" });
    }

    // ✅ VALIDATE USER HAS COMPANY
    if (!req.user.company) {
      console.log("❌ User does not have company assigned");
      return res.status(400).json({ message: "Your account is not assigned to any company. Please contact admin." });
    }

    const companyId = req.user.company;
    console.log("📋 Creating project for company:", companyId);

    // ✅ EXTRACT MENTIONS
    const allUsers = await User.find();
    const mentionedMembers = extractMentions(description || "", allUsers);

    // ✅ CREATE PROJECT WITH COMPANY
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
      company: companyId, // ✅ STORE COMPANY AUTOMATICALLY
    });

    console.log("✅ Project created:", project._id);

    // ✅ POPULATE DATA
    await project.populate([
      { 
        path: "members", 
        select: "username email role", 
        populate: { path: "role", select: "name" } 
      },
      { path: "createdBy", select: "username email" },
      { path: "company", select: "name" },
    ]);

    console.log("📧 Project populated, sending emails...");

    // ✅ SEND EMAILS TO MEMBERS
    if (project.members && project.members.length > 0) {
      project.members.forEach((member) => {
        try {
          sendProjectEmail(member, project, "create");
        } catch (emailError) {
          console.error("Email error for", member.email, ":", emailError.message);
        }
      });
    }

    // ✅ SOCKET EMISSION
    if (io) {
      try {
        const room = `org_${req.user.organizationId || "default"}`;
        io.to(room).emit("projectCreated", { 
          project, 
          message: `New project "${name}" created` 
        });
        console.log("📡 Socket emitted: projectCreated");
      } catch (socketError) {
        console.error("Socket error:", socketError.message);
      }
    }

    console.log("✅ Project creation complete");
    res.status(201).json({ 
      message: "Project created successfully", 
      project 
    });

  } catch (err) {
    console.error("❌ Create Project Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ 
      message: "Server Error: " + err.message 
    });
  }
};

/* ================= GET ALL PROJECTS (FILTER BY COMPANY) ================= */
exports.getProjects = async (req, res) => {
  try {
    console.log("📖 Getting projects for user:", req.user._id);
    console.log("User Company:", req.user.company);

    const { search, type } = req.query;

    // ✅ VALIDATE USER HAS COMPANY
    if (!req.user.company) {
      console.log("❌ User does not have company assigned");
      return res.status(400).json({ message: "Your account is not assigned to any company" });
    }

    const userCompanyId = req.user.company;

    // ✅ BUILD QUERY - ALWAYS FILTER BY COMPANY
    let query = {
      company: userCompanyId,
    };

    // ✅ ADD SEARCH FILTER
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // ✅ ADD TYPE FILTER
    if (type) {
      query.type = type;
    }

    console.log("🔍 Query:", query);

    // ✅ FETCH PROJECTS
    const projects = await Project.find(query)
      .populate({
        path: "members",
        select: "username email role",
        populate: { path: "role", select: "name" },
      })
      .populate("createdBy", "username email")
      .populate("company", "name")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${projects.length} projects`);

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
      .populate({
        path: "members",
        select: "username email role",
        populate: {
          path: "role",
          select: "name",
        },
      })
      .populate("mentionedMembers", "username email")
      .populate("createdBy", "username email")
      .populate("company", "name");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ✅ CHECK IF PROJECT BELONGS TO USER'S COMPANY
    if (project.company?._id.toString() !== req.user.company?.toString()) {
      console.log("❌ Unauthorized - project company mismatch");
      return res.status(403).json({ message: "Unauthorized" });
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
      populate: {
        path: "role",
        select: "name",
      },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ✅ CHECK IF PROJECT BELONGS TO USER'S COMPANY
    if (project.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
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
    
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ✅ CHECK IF PROJECT BELONGS TO USER'S COMPANY
    if (project.company?.toString() !== req.user.company?.toString()) {
      console.log("❌ Unauthorized - project company mismatch");
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { name, description, type, members, status, dueDate, isActive } = req.body;

    // ✅ UPDATE FIELDS
    if (name) project.name = name;
    if (description !== undefined) project.description = description;
    if (type) project.type = type;
    if (members) project.members = members;
    if (status) project.status = status;
    if (dueDate !== undefined) project.dueDate = dueDate;
    if (isActive !== undefined) project.isActive = Boolean(isActive);

    // ✅ EXTRACT MENTIONS
    if (description) {
      const allUsers = await User.find();
      project.mentionedMembers = extractMentions(description, allUsers);
    }

    // ✅ SAVE PROJECT
    await project.save();
    await project.populate([
      { 
        path: "members", 
        select: "username email role", 
        populate: { path: "role", select: "name" } 
      },
      { path: "createdBy", select: "username email" },
      { path: "company", select: "name" },
    ]);

    // ✅ SEND EMAILS
    if (project.members && project.members.length > 0) {
      project.members.forEach((member) => {
        try {
          sendProjectEmail(member, project, "update");
        } catch (emailError) {
          console.error("Email error:", emailError.message);
        }
      });
    }

    // ✅ SOCKET EMISSION
    if (io) {
      const room = `org_${req.user.organizationId || "default"}`;
      io.to(room).emit("projectUpdated", { 
        project, 
        message: `Project "${project.name}" updated` 
      });
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

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // ✅ CHECK IF PROJECT BELONGS TO USER'S COMPANY
    if (project.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const projectName = project.name;
    await Project.findByIdAndDelete(req.params.id);

    // ✅ SOCKET EMISSION
    if (io) {
      try {
        io.to(`org_${req.user.organizationId || "default"}`).emit("projectDeleted", {
          projectId: req.params.id,
          projectName: projectName,
          message: `Project "${projectName}" has been deleted`,
        });
      } catch (socketError) {
        console.error("Socket error:", socketError.message);
      }
    }

    res.json({ message: "Project deleted" });

  } catch (err) {
    console.error("❌ Delete Project Error:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};