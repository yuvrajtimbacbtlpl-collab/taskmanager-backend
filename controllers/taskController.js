const Task = require("../models/Task");
const User = require("../models/User");
const sendTaskEmail = require("../utils/sendMail");

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";


/* ================================
   CREATE TASK
================================ */
exports.createTask = async (req, res) => {
  try {
    const io = req.app.get("io");

    // ✅ added project
    const { title, description, assignedTo, priority, dueDate, status, project } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({ message: "Title and Assigned User required" });
    }

    const user = await User.findById(assignedTo);
    if (!user) return res.status(404).json({ message: "User not found" });

    const mediaFiles = req.files ? req.files.map(f => f.filename) : [];

    const task = await Task.create({
      title,
      description,
      assignedTo,
      priority: priority || "Normal",
      dueDate,
      status: status || "Pending",
      media: mediaFiles,
      createdBy: req.user.id,
      project, // ✅ NEW
    });

    /* ===== EMAIL (unchanged) ===== */
    try {
      await sendTaskEmail({
        to: user.email,
        subject: `New Task Assigned: ${title}`,
        html: `
        <div style="
          font-family: Arial, sans-serif; 
          color: #333; 
          line-height: 1.6; 
          max-width: 600px; 
          margin: auto; 
          padding: 20px; 
          border: 1px solid #e0e0e0; 
          border-radius: 8px;
        ">
          <h2 style="color: #004aad;">Hello ${user.username},</h2>
          <p>You have been assigned a <strong>new task</strong> in Task Manager.</p>

          <p><strong>Title:</strong> ${title}</p>
          <p><strong>Description:</strong> ${description || "-"}</p>
          <p><strong>Status:</strong> ${status || "Pending"}</p>
          <p><strong>Priority:</strong> ${priority || "Normal"}</p>
          <p><strong>Due Date:</strong> ${dueDate ? new Date(dueDate).toLocaleDateString() : "-"}</p>

          ${
            mediaFiles.length > 0
              ? `
            <p><strong>Attached Media:</strong></p>
            <ul>
              ${mediaFiles
                .map(
                  (f) =>
                    `<li><a href="${BASE_URL}/uploads/${f}" target="_blank">${f}</a></li>`
                )
                .join("")}
            </ul>`
              : ""
          }

          <p>Please login to Task Manager.</p>
        </div>
      `,
      });
    } catch (mailError) {
      console.error("Mail Error:", mailError.message);
    }

    if (io) io.emit("taskUpdated");

    res.status(201).json({ message: "Task created successfully", task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};



/* ================================
   GET ALL TASKS
================================ */
exports.getTasks = async (req, res) => {
  try {
    // ✅ added project filter
    const { status, assignedTo, search, project } = req.query;

    let query = {};

    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    if (project) query.project = project; // ✅ NEW

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "username email")
      .populate("project", "name") // ✅ NEW
      .sort({ createdAt: -1 });

    res.json(tasks);

  } catch (err) {
    res.status(500).json({
      message: err.message || "Failed to fetch tasks",
    });
  }
};



/* ================================
   GET MY TASKS
================================ */
exports.getMyTasks = async (req, res) => {
  try {
    const tasks = await Task.find({
      assignedTo: req.user.id,
    })
      .populate("assignedTo", "username email")
      .populate("project", "name") // ✅ NEW
      .sort({ createdAt: -1 });

    res.json(tasks);

  } catch (err) {
    res.status(500).json({
      message: err.message || "Failed",
    });
  }
};



/* ================================
   UPDATE TASK
================================ */
exports.updateTask = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const mediaFiles = req.files?.map((f) => f.filename) || [];
    if (req.files && req.files.length > 0) {
      task.media = [...task.media, ...mediaFiles];
    }

    task.title = req.body.title || task.title;
    task.description = req.body.description || task.description;
    task.assignedTo = req.body.assignedTo || task.assignedTo;
    task.status = req.body.status || task.status;
    task.priority = req.body.priority || task.priority;
    task.dueDate = req.body.dueDate || task.dueDate;

    // ✅ NEW project update support
    task.project = req.body.project || task.project;

    await task.save();
    await task.populate("assignedTo", "username email");

    /* ===== EMAIL unchanged ===== */
    try {
      const user = await User.findById(task.assignedTo._id);

      sendTaskEmail({
        to: user.email,
        subject: `Task Updated: ${task.title}`,
        html: `<p>Your task has been updated.</p>`,
      });
    } catch (mailError) {
      console.log("Email Error:", mailError.message);
    }

    if (io) io.emit("taskUpdated");

    res.json({ message: "Task updated successfully", task });
  } catch (err) {
    res.status(500).json({ message: err.message || "Update failed" });
  }
};



/* ================================
   DELETE TASK
================================ */
exports.deleteTask = async (req, res) => {
  try {
    const io = req.app.get("io");

    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    if (io) io.emit("taskUpdated");

    res.json({
      message: "Task deleted successfully",
    });

  } catch (err) {
    res.status(500).json({
      message: err.message || "Delete failed",
    });
  }
};