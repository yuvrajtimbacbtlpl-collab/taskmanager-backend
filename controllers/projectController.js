const Project = require("../models/Project");
const User = require("../models/User");
const extractMentions = require("../utils/extractMentions");

/* ================= CREATE PROJECT ================= */
exports.createProject = async (req, res) => {
  try {
    const io = req.app.get("io");

    const { name, description, members = [], type = "Business", status, dueDate } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Project name required" });
    }

    const allUsers = await User.find();
    const mentionedMembers = extractMentions(description || "", allUsers);

    const project = await Project.create({
      name,
      description,
      type,
      members,
      mentionedMembers,
      status: status || "Active",
      dueDate,
      createdBy: req.user.id,
    });

    /* ===== POPULATE DATA ===== */
    await project.populate([
      {
        path: "members",
        select: "username email role",
        populate: { path: "role", select: "name" },
      },
      { path: "createdBy", select: "username email" },
    ]);

    /* ===== SOCKET EMISSION ===== */
    if (io) {
      try {
        // Emit to all clients in organization room (for Projects page)
        io.to("org_${req.user.organizationId || 'default'}").emit("projectCreated", {
          project,
          message: `New project "${name}" has been created`,
        });
        console.log("✅ projectCreated emitted");
      } catch (socketError) {
        console.error("Socket emission error:", socketError);
      }
    }

    res.status(201).json({
      message: "Project created",
      project,
    });
  } catch (err) {
    console.error("Create Project Error:", err);
    res.status(500).json({ message: "Server Error" });
  }
};

/* ================= GET ALL PROJECTS ================= */
exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find()
      .populate({
        path: "members",
        select: "username email role",
        populate: {
          path: "role",
          select: "name",
        },
      })
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    console.error("Get Projects Error:", err);
    res.status(500).json({ message: err.message });
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
      .populate("createdBy", "username email");

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json(project);
  } catch (err) {
    console.error("Get Project Error:", err);
    res.status(500).json({ message: err.message });
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

    res.json(project.members || []);
  } catch (err) {
    console.error("Get Team Error:", err);
    res.status(500).json({ message: err.message });
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

    const { name, description, type, members, status, dueDate } = req.body;

    if (name) project.name = name;
    if (description) project.description = description;
    if (type) project.type = type;
    if (members) project.members = members;
    if (status) project.status = status;
    if (dueDate) project.dueDate = dueDate;

    if (description) {
      const allUsers = await User.find();
      project.mentionedMembers = extractMentions(description, allUsers);
    }

    await project.save();

    /* ===== POPULATE DATA ===== */
    await project.populate([
      {
        path: "members",
        select: "username email role",
        populate: { path: "role", select: "name" },
      },
      { path: "createdBy", select: "username email" },
    ]);

    /* ===== SOCKET EMISSION ===== */
    if (io) {
      try {
        // Emit to all clients in organization room
        io.to("org_${req.user.organizationId || 'default'}").emit("projectUpdated", {
          project,
          message: `Project "${project.name}" has been updated`,
        });
        console.log("✅ projectUpdated emitted");
      } catch (socketError) {
        console.error("Socket emission error:", socketError);
      }
    }

    res.json({
      message: "Project updated",
      project,
    });
  } catch (err) {
    console.error("Update Project Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ================= DELETE PROJECT ================= */
exports.deleteProject = async (req, res) => {
  try {
    const io = req.app.get("io");

    const project = await Project.findByIdAndDelete(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    /* ===== SOCKET EMISSION ===== */
    if (io) {
      try {
        // Emit to all clients in organization room
        io.to("org_${req.user.organizationId || 'default'}").emit("projectDeleted", {
          projectId: req.params.id,
          projectName: project.name,
          message: `Project "${project.name}" has been deleted`,
        });
        console.log("✅ projectDeleted emitted");
      } catch (socketError) {
        console.error("Socket emission error:", socketError);
      }
    }

    res.json({ message: "Project deleted" });
  } catch (err) {
    console.error("Delete Project Error:", err);
    res.status(500).json({ message: err.message });
  }
};