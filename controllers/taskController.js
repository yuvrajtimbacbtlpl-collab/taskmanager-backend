const Task = require("../models/Task");
const User = require("../models/User");
const Project = require("../models/Project");
const sendTaskEmail = require("../utils/sendMail");
const XLSX = require("xlsx");
const fs = require("fs");

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

/* ================================
   EMAIL TEMPLATE
================================ */
const professionalTemplate = ({ recipientName, message, taskTitle, status, priority, appLink }) => {
  const priorityColor = priority === "High" ? "#ef4444" : "#3b82f6";

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; color: #374151;">
      <div style="background-color: #1f2937; padding: 20px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 20px;">Task Management System</h2>
      </div>
      <div style="padding: 30px;">
        <h3 style="color: #111827; margin-top: 0;">Hello ${recipientName},</h3>
        <p style="font-size: 16px; line-height: 1.5;">${message}</p>
        
        <div style="background: #f9fafb; border-radius: 6px; padding: 20px; margin: 25px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Task:</strong> ${taskTitle}</p>
          <p style="margin: 0 0 10px 0;"><strong>Status:</strong> <span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${status}</span></p>
          <p style="margin: 0;"><strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: bold;">${priority}</span></p>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${appLink}" style="background-color: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: 600;">View in Dashboard</a>
        </div>
      </div>
      <div style="background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
        This is an automated notification. Please do not reply to this email.
      </div>
    </div>
  `;
};

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
      company,
      appLink
    } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({
        message: "Title and Assigned User required",
      });
    }

    if (!company) {
      return res.status(400).json({
        message: "Company ID is required",
      });
    }

    const user = await User.findById(assignedTo);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Verify project belongs to the company
    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(404).json({ message: "Project not found" });
    }
    if (projectDoc.company.toString() !== company) {
      return res.status(403).json({ message: "Project does not belong to this company" });
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
      company, // ✅ ADDED COMPANY FIELD
      type: type || "task",
    });

    /* ===== PROFESSIONAL EMAIL ===== */
    const label = task.type === "issue" ? "Issue" : "Task";
    const finalAppLink = appLink || BASE_URL;

    try {
      if (user.email) {
        await sendTaskEmail({
          to: user.email,
          subject: `New ${label} Assigned: ${title}`,
          html: professionalTemplate({
            recipientName: user.username,
            message: `You have been assigned a new ${label.toLowerCase()}. Please review the details below.`,
            taskTitle: title,
            status: task.status,
            priority: task.priority,
            appLink: finalAppLink
          })
        });
      }
    } catch (mailError) {
      console.error("Mail Error:", mailError.message);
    }

    /* ===== POPULATE DATA ===== */
    await task.populate([
      { path: "assignedTo", select: "username email" },
      { path: "project", select: "name" },
      { path: "company", select: "name" }, // ✅ POPULATE COMPANY
      { path: "createdBy", select: "username email" }
    ]);

    /* ===== SOCKET EMISSION ===== */
    if (io && task.project) {
      try {
        const eventName = task.type === "issue" ? "issueCreated" : "taskCreated";
        io.to(`project_${task.project._id || task.project}`).emit(eventName, {
          task,
          message: `New ${task.type} "${task.title}" has been created`,
        });
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
   GET ALL TASKS / ISSUES (With Company Filter)
================================ */
exports.getTasks = async (req, res) => {
  try {
    const { status, assignedTo, search, project, type, company, page = 1, limit = 10 } = req.query;

    let query = {};
    if (status) query.status = status;
    if (project) query.project = project;
    if (type) query.type = type;
    if (company) query.company = company; // ✅ FILTER BY COMPANY

    // --- START: PRIVATE VISIBILITY LOGIC ---
    // If NOT an Admin, only show issues where I am the Assignee OR the Creator
    // This prevents User 2 from seeing User 1's issues.
    if (req.user.role !== "ADMIN") {
      query.$or = [
        { assignedTo: req.user.id },
        { createdBy: req.user.id }
      ];
    } else {
      // Admins can see all, but if a specific filter is applied by the Admin:
      if (assignedTo) query.assignedTo = assignedTo;
    }
    // --- END: PRIVATE VISIBILITY LOGIC ---

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "username email")
        .populate("createdBy", "username email")
        .populate("project", "name")
        .populate("company", "name") // ✅ POPULATE COMPANY
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
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


/* ================================
   UPDATE TASK / ISSUE
================================ */
exports.updateTask = async (req, res) => {
  try {
    const io = req.app.get("io");
    const { id } = req.params;

    const task = await Task.findById(id)
      .populate("assignedTo", "username email")
      .populate("createdBy", "username email")
      .populate("company", "name"); // ✅ POPULATE COMPANY

    if (!task) return res.status(404).json({ message: "Task not found" });

    const isAssignee = task.assignedTo?._id.toString() === req.user.id;
    const isAdmin = req.user.role === "ADMIN";

    const oldStatus = task.status;
    const newStatus = req.body.status;

    // Apply updates
    if (!isAdmin && isAssignee && !req.user.permissions?.includes("issue.update")) {
      task.status = newStatus || task.status;
    } else {
      task.status = newStatus || task.status;
      task.title = req.body.title || task.title;
      task.description = req.body.description || task.description;
      task.assignedTo = req.body.assignedTo || task.assignedTo;
      task.priority = req.body.priority || task.priority;
      task.dueDate = req.body.dueDate || task.dueDate;
      // ✅ ALLOW COMPANY UPDATE (if needed)
      if (req.body.company) task.company = req.body.company;
    }

    if (req.files && req.files.length > 0) {
      const mediaFiles = req.files.map((f) => f.filename);
      task.media = [...task.media, ...mediaFiles];
    }

    await task.save();

    /* ===== EMAIL NOTIFICATION LOGIC ===== */
    const label = task.type === "issue" ? "Issue" : "Task";
    const appLink = req.body.appLink || BASE_URL;

    if (newStatus && oldStatus !== newStatus && task.createdBy?.email) {
      await sendTaskEmail({
        to: task.createdBy.email,
        subject: `Update: ${task.title} is ${newStatus}`,
        html: professionalTemplate({
          recipientName: task.createdBy.username,
          message: `The user <b>${req.user.username}</b> has updated the status of your ${label.toLowerCase()} to <b>${newStatus}</b>.`,
          taskTitle: task.title,
          status: newStatus,
          priority: task.priority,
          appLink
        })
      });
    }

    /* ===== FIXED SOCKET EMISSION FOR ADMIN ===== */
    if (io && task.project) {
      const roomName = `project_${task.project._id || task.project}`;

      // 1. Detect type to choose correct event name
      const isIssue = task.type === "issue";
      const updateEvent = isIssue ? "issueUpdated" : "taskUpdated";
      const statusEvent = isIssue ? "issueStatusChanged" : "taskStatusChanged";

      // 2. Emit General Update (for the modal/form edits)
      io.to(roomName).emit(updateEvent, { task });

      // 3. Emit Specific Status Change (for the Admin's table/inline refresh)
      if (newStatus && oldStatus !== newStatus) {
        io.to(roomName).emit(statusEvent, {
          taskId: task._id,
          newStatus,
          message: `${label} status changed to ${newStatus}`
        });
      }
    }

    res.json({ message: "Updated successfully", task });

  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   DELETE TASK
================================ */
exports.deleteTask = async (req, res) => {
  try {
    const io = req.app.get("io");
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) return res.status(404).json({ message: "Task not found" });

    if (io && task.project) {
      const eventName = task.type === "issue" ? "issueDeleted" : "taskDeleted";
      io.to(`project_${task.project}`).emit(eventName, {
        taskId: req.params.id,
        message: `${task.type} deleted`,
      });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   BULK UPLOAD TASKS (With Company)
================================ */
exports.bulkUploadTasks = async (req, res) => {
  let filePath = null;
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: "No file uploaded" });

    const { project, type, company } = req.body;
    
    if (!company) {
      return res.status(400).json({ message: "Company ID is required for bulk upload" });
    }

    filePath = req.files[0].path;

    const workbook = XLSX.readFile(filePath);
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const tasksToInsert = sheetData.map(row => ({
      title: row.Title || row.title,
      description: row.Description || row.description || "",
      status: row.Status || row.status || "Pending",
      priority: row.Priority || row.priority || "Normal",
      project,
      type: type || "task",
      createdBy: req.user.id,
      assignedTo: row.AssignedTo || null,
      company, // ✅ ADDED COMPANY FIELD
    }));

    if (tasksToInsert.length > 0) {
      await Task.insertMany(tasksToInsert);
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(201).json({ message: "Bulk upload successful", count: tasksToInsert.length });
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ message: "Bulk upload failed" });
  }
};

/* ================================
   GET MY TASKS (With Company Filter)
================================ */
exports.getMyTasks = async (req, res) => {
  try {
    const { status, search, project, type, company, page = 1, limit = 10 } = req.query;
    let query = { assignedTo: req.user.id };

    if (status) query.status = status;
    if (project) query.project = project;
    if (company) query.company = company; // ✅ FILTER BY COMPANY
    query.type = type || "task";

    if (search) query.title = { $regex: search, $options: "i" };

    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "username email")
        .populate("createdBy", "username email")
        .populate("project", "name")
        .populate("company", "name") // ✅ POPULATE COMPANY
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Task.countDocuments(query)
    ]);

    res.json({ data: tasks, totalRecords: total, totalPages: Math.ceil(total / l), currentPage: p });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};