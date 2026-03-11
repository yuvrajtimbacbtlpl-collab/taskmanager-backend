const Task = require("../models/Task");
const User = require("../models/User");
const sendTaskEmail = require("../utils/sendMail");
const XLSX = require("xlsx");
const fs = require("fs"); // Add this at the top of taskController.js

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

            ${mediaFiles.length > 0
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

    /* ===== POPULATE DATA ===== */
    await task.populate([
      { path: "assignedTo", select: "username email" },
      { path: "project", select: "name" },
    ]);

    /* ===== SOCKET EMISSION ===== */
    if (io && task.project) {
      try {
        const eventName = task.type === "issue" ? "issueCreated" : "taskCreated";
        // Emit to all clients in project room (for Tasks/Issues page)
        io.to(`project_${task.project._id || task.project}`).emit(eventName, {
          task,
          message: `New ${task.type} "${task.title}" has been created`,
        });
        console.log(`✅ ${eventName} emitted to project room`);
      } catch (socketError) {
        console.error("Socket emission error:", socketError);
      }
    }

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

    /* ===== SOCKET EMISSION ===== */
    if (io && task.project) {
      try {
        const eventName = task.type === "issue" ? "issueStatusChanged" : "taskStatusChanged";
        // Emit to all clients in project room
        io.to(`project_${task.project}`).emit(eventName, {
          task,
          message: `${task.type === "issue" ? "Issue" : "Task"} "${task.title}" status changed to ${task.status}`,
        });
        console.log(`✅ ${eventName} emitted to project room`);
      } catch (socketError) {
        console.error("Socket emission error:", socketError);
      }
    }

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

    /* ===== SOCKET EMISSION ===== */
    if (io && task.project) {
      try {
        const eventName = task.type === "issue" ? "issueDeleted" : "taskDeleted";
        // Emit to all clients in project room
        io.to(`project_${task.project}`).emit(eventName, {
          taskId: req.params.id,
          taskTitle: task.title,
          message: `${task.type === "issue" ? "Issue" : "Task"} "${task.title}" has been deleted`,
        });
        console.log(`✅ ${eventName} emitted to project room`);
      } catch (socketError) {
        console.error("Socket emission error:", socketError);
      }
    }

    res.json({
      message: "Deleted successfully",
    });

  } catch (err) {
    res.status(500).json({
      message: err.message || "Delete failed",
    });
  }
};


/* ================================
   BULK UPLOAD TASKS (Optimized)
================================ */
exports.bulkUploadTasks = async (req, res) => {
  let filePath = null;
  try {
    // 1. Check if files exist
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No file uploaded. Ensure field name is 'file'" });
    }

    const { project, type } = req.body;
    const taskType = type || "task";
    
    if (!project) {
        // Cleanup file if project is missing
        if (req.files[0].path) fs.unlinkSync(req.files[0].path);
        return res.status(400).json({ message: "Project ID is required" });
    }

    filePath = req.files[0].path;

    // 2. Read Workbook
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (sheetData.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ message: "Excel sheet is empty" });
    }

    // 3. Optimized Duplicate Check
    const existingTasks = await Task.find({ project, type: taskType }, "title assignedTo").lean();
    const existingSet = new Set(existingTasks.map(t => 
      `${String(t.title).trim().toLowerCase()}_${t.assignedTo ? String(t.assignedTo) : ''}`
    ));

    const tasksToInsert = [];
    const skippedCount = { duplicates: 0, invalid: 0 };

    for (const row of sheetData) {
      const title = row.Title || row.title || row.TITLE;
      if (!title) {
        skippedCount.invalid++;
        continue;
      }

      const rawId = row.AssignedTo || row.assignedTo || row.AssignedToID || row.assignedto;
      let assignedTo = (rawId && /^[0-9a-fA-F]{24}$/.test(rawId.toString().trim()))
        ? rawId.toString().trim()
        : null;

      // Duplicate Check
      const lookupKey = `${String(title).trim().toLowerCase()}_${assignedTo || ''}`;
      if (existingSet.has(lookupKey)) {
        skippedCount.duplicates++;
        continue;
      }

      tasksToInsert.push({
        title: String(title).trim(),
        description: row.Description || row.description || "",
        status: row.Status || row.status || "Pending",
        priority: row.Priority || row.priority || "Normal",
        project,
        type: taskType,
        createdBy: req.user.id,
        assignedTo,
        media: []
      });
    }

    // 4. Batch Insert
    let importedCount = 0;
    if (tasksToInsert.length > 0) {
      const result = await Task.insertMany(tasksToInsert);
      importedCount = result.length;

      const io = req.app.get("io");
      if (io) {
        io.to(`project_${project}`).emit(taskType === "issue" ? "issueCreated" : "taskCreated", {
          message: "Bulk upload complete",
          count: importedCount
        });
      }
    }

    // Cleanup
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.status(201).json({
      message: "Processing complete",
      count: importedCount,
      skipped: skippedCount.duplicates,
      invalid: skippedCount.invalid
    });

  } catch (error) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error("BULK UPLOAD ERROR:", error);
    res.status(500).json({ message: "Server Error during processing", error: error.message });
  }
};


/* ================================
   GET ALL TASKS (Unified Format)
================================ */

exports.getTasks = async (req, res) => {
  try {
    const { status, assignedTo, search, project, type, page = 1, limit = 10 } = req.query;
    let query = {};
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    if (project) query.project = project;
    if (type) query.type = type; // This ensures it filters by 'task' or 'issue'

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "username email")
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Task.countDocuments(query)
    ]);

    // This specific structure prevents the .slice() error
    res.json({
      data: tasks, 
      totalRecords: total,
      totalPages: Math.ceil(total / l),
      currentPage: p
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   GET MY TASKS (Already Correct)
================================ */
exports.getMyTasks = async (req, res) => {
  try {
    const { status, search, project, type, page = 1, limit = 10 } = req.query;
    let query = { assignedTo: req.user.id };

    if (status) query.status = status;
    if (project) query.project = project;
    query.type = type || "task";

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));
    const skip = (p - 1) * l;

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "username email")
        .populate("project", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean(),
      Task.countDocuments(query)
    ]);

    res.json({
      data: tasks,
      totalRecords: total,
      totalPages: Math.ceil(total / l),
      currentPage: p
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};