const Task = require("../models/Task");
const User = require("../models/User");
const sendTaskEmail = require("../utils/sendMail");

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";


/* ================================
   CREATE TASK / ISSUE
================================ */
exports.createTask = async (req, res) => {
  try {
    const io = req.app.get("io");

    const {
      title,
      description,
      assignedTo,
      priority,
      dueDate,
      status,
      project,
      type,
    } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({
        message: "Title and Assigned User required",
      });
    }

    const user = await User.findById(assignedTo);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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
      project,
      type: type || "task",
    });

    /* ===== EMAIL ===== */

    const label = task.type === "issue" ? "Issue" : "Task";

    try {

      // ✅ VERY IMPORTANT FIX
      if (user.email) {

        await sendTaskEmail({
          to: user.email,
          subject: `New ${label} Assigned: ${title}`,
          html: `
          <div style="font-family: Arial; padding:20px;">
            <h3>Hello ${user.username},</h3>
            <p>You have been assigned a new ${label}.</p>

            <p><strong>${label} Title:</strong> ${title}</p>
            <p><strong>Description:</strong> ${description || "-"}</p>
            <p><strong>Status:</strong> ${status || "Pending"}</p>
            <p><strong>Priority:</strong> ${priority || "Normal"}</p>

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

      } else {
        console.log("⚠️ Email not found for user:", user._id);
      }

    } catch (mailError) {
      console.error("Mail Error:", mailError.message);
    }

    if (io) io.emit("taskUpdated");

    res.status(201).json({
      message: `${label} created successfully`,
      task,
    });

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
    const { status, assignedTo, search, project, type } = req.query;

    let query = {};

    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    if (project) query.project = project;
    if (type) query.type = type;

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "username email")
      .populate("project", "name")
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
    const { status, assignedTo, search, project, type } = req.query;

    let query = {};

    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    if (project) query.project = project;

    // ✅ VERY IMPORTANT
    // Default = task (so task page never gets issues accidentally)
    query.type = type || "task";

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    const tasks = await Task.find(query)
      .populate("assignedTo", "username email")
      .populate("project", "name")
      .sort({ createdAt: -1 });

    res.json(tasks);

  } catch (err) {
    res.status(500).json({
      message: err.message || "Failed to fetch tasks",
    });
  }
};



/* ================================
   UPDATE TASK / ISSUE
================================ */
exports.updateTask = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { id } = req.params;

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

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
    task.project = req.body.project || task.project;
    task.type = req.body.type || task.type;

    await task.save();
    await task.populate("assignedTo", "username email");

    /* ===== EMAIL ===== */

    const label = task.type === "issue" ? "Issue" : "Task";

    try {

      const user = await User.findById(task.assignedTo._id);

      // ✅ SAFE CHECK
      if (user?.email) {

        await sendTaskEmail({
          to: user.email,
          subject: `${label} Updated: ${task.title}`,
          html: `
          <div style="font-family: Arial; padding:20px;">
            <h3>Hello ${user.username},</h3>
            <p>Your ${label} has been updated.</p>

            <p><strong>${label} Title:</strong> ${task.title}</p>
            <p><strong>Status:</strong> ${task.status}</p>
            <p><strong>Priority:</strong> ${task.priority}</p>

            <p>Please login to view details.</p>
          </div>
        `,
        });

      } else {
        console.log("⚠️ Email not found for user:", task.assignedTo);
      }

    } catch (mailError) {
      console.log("Email Error:", mailError.message);
    }

    if (io) io.emit("taskUpdated");

    res.json({
      message: `${label} updated successfully`,
      task,
    });

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
      message: "Deleted successfully",
    });

  } catch (err) {
    res.status(500).json({
      message: err.message || "Delete failed",
    });
  }
};