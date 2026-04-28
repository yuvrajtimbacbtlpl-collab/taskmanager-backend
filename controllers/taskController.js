// controllers/taskController.js
// CHANGES FROM YOUR ORIGINAL:
//   - Added Company import (needed to fetch workingHours for endDate calculation)
//   - Added workingHoursCalculator import
//   - createTask: accepts startDate, estimatedHours, endDate; auto-calculates endDate from hours
//   - updateTask: recalculates endDate when startDate or estimatedHours changes;
//                 auto-stamps endDate when task is marked completed
//   - All existing encrypt/decrypt logic for dueDate is FULLY PRESERVED ✅
//   - All existing email, socket, bulk upload, permission logic UNCHANGED ✅

const Task = require("../models/Task");
const User = require("../models/User");
const Project = require("../models/Project");
const Company = require("../models/Company");                          // ✅ NEW
const XLSX = require("xlsx");
const fs = require("fs");
const { encrypt, decrypt } = require("../utils/encrypt");             // ✅ your existing
const { calculateEndDate } = require("../utils/workingHoursCalculator"); // ✅ NEW
const { createNotification } = require("../utils/notificationHelper"); // ✅ Notifications
const {
  sendTaskAssignedEmail,
  sendTaskStatusUpdateEmail,
} = require("../utils/mailService");                                   // ✅ IMPROVED mail

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

/* ================================
   HELPER: decrypt dueDate on a plain task object
   ✅ YOUR EXISTING HELPER — UNCHANGED
================================ */
function decryptTaskDueDate(task) {
  if (task && task.dueDate) {
    task.dueDate = decrypt(task.dueDate);
  }
  return task;
}

/* ================================
   HELPER: compute endDate from startDate + estimatedHours
   using company's working hours config
================================ */
async function computeEndDate(startDateTime, estimatedHours, companyId) {
  if (!startDateTime || !estimatedHours || parseFloat(estimatedHours) <= 0) return null;
  try {
    const companyDoc = await Company.findById(companyId).lean();
    if (!companyDoc || !companyDoc.workingHours?.length) return null;
    // ✅ Pass the full datetime — calculator starts counting from this exact moment
    const result = calculateEndDate(
      new Date(startDateTime),
      parseFloat(estimatedHours),
      companyDoc.workingHours,
      companyDoc.holidays || []
    );
    return result ? { endDate: result.endDate, startDateTime: result.startDateTime } : null;
  } catch (e) {
    console.error("endDate calculation error:", e.message);
    return null;
  }
}

/* ================================
   CREATE TASK / ISSUE
================================ */
exports.createTask = async (req, res) => {
  try {
    const io = req.app.get("io");
    const {
      title, description, assignedTo, priority,
      dueDate, status, project, type, company, appLink,
      estimatedHours, endDate,                         // ✅ NEW: startDate is auto-set to NOW
    } = req.body;

    if (!title || !assignedTo) {
      return res.status(400).json({ message: "Title and Assigned User required" });
    }
    if (!company) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const user = await User.findById(assignedTo);
    if (!user) return res.status(404).json({ message: "User not found" });

    const projectDoc = await Project.findById(project);
    if (!projectDoc) return res.status(404).json({ message: "Project not found" });
    if (projectDoc.company.toString() !== company) {
      return res.status(403).json({ message: "Project does not belong to this company" });
    }

    const mediaFiles = req.files ? req.files.map(f => f.filename) : [];

    // ✅ YOUR EXISTING: Encrypt dueDate before saving to DB
    const encryptedDueDate = dueDate ? encrypt(dueDate) : null;

    // ✅ NEW: startDate = NOW (auto-set server-side, user does NOT provide it)
    const now = new Date();
    let computedStartDate = now;
    let computedEndDate = endDate ? new Date(endDate) : null;

    if (estimatedHours && !computedEndDate) {
      const calcResult = await computeEndDate(now, estimatedHours, company);
      if (calcResult) {
        computedEndDate = calcResult.endDate;
        computedStartDate = calcResult.startDateTime || now; // actual start (may be next working day)
      }
    }

    const task = await Task.create({
      title, description,
      assignedTo,
      priority: priority || "Normal",
      dueDate: encryptedDueDate,                           // ✅ stored encrypted (your existing)
      status: status || "Pending",
      media: mediaFiles,
      createdBy: req.user._id || req.user.id,
      project,
      company,
      type: type || "task",
      startDate: computedStartDate,                               // ✅ auto = now
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null, // ✅ NEW
      endDate: computedEndDate,                                 // ✅ auto-calculated
    });

    const label = task.type === "issue" ? "Issue" : "Task";
    const finalAppLink = appLink || BASE_URL;

    // ✅ IMPROVED: Professional assigned email with full task details
    try {
      await task.populate([
        { path: "assignedTo", select: "username email" },
        { path: "project", select: "name" },
        { path: "company", select: "name" },
        { path: "createdBy", select: "username email" },
      ]);
      await sendTaskAssignedEmail({
        assignee: task.assignedTo,
        creator: task.createdBy,
        task,
        appLink: finalAppLink,
      });
    } catch (mailError) { console.error("Mail Error:", mailError.message); }

    if (io && task.project) {
      try {
        const eventName = task.type === "issue" ? "issueCreated" : "taskCreated";
        io.to(`project_${task.project._id || task.project}`).emit(eventName, {
          task, message: `New ${task.type} "${task.title}" created`
        });
      } catch (e) { console.error("Socket error:", e); }
    }

    // ✅ Notification: alert assignedTo user
    if (task.assignedTo) {
      const isIssue = task.type === "issue";
      await createNotification(io, {
        userId: task.assignedTo._id || task.assignedTo,
        companyId: task.company,
        type: isIssue ? "issue" : "task",
        action: "assigned",
        title: `New ${isIssue ? "Issue" : "Task"} Assigned`,
        message: `"${task.title}" has been assigned to you`,
        refId: task._id,
        refModel: "Task",
        triggeredBy: req.user?._id,
      });
    }

    // ✅ YOUR EXISTING: Decrypt dueDate for response so frontend gets readable date
    const responseTask = task.toObject();
    responseTask.dueDate = task.dueDate ? decrypt(task.dueDate) : null;

    res.status(201).json({ message: `${label} created successfully`, task: responseTask });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

/* ================================
   GET ALL TASKS / ISSUES
================================ */
exports.getTasks = async (req, res) => {
  try {
    const { status, assignedTo, search, project, type, company, page = 1, limit = 10 } = req.query;

    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";
    const isOwner = roleName === "COMPANY_OWNER";

    let query = {};
    if (status) query.status = status;
    if (project) query.project = project;
    if (type) query.type = type;

    const userId = req.user._id || req.user.id;

    if (isAdmin) {
      if (company && company !== "global") {
        query.company = company;
      }
      if (assignedTo) query.assignedTo = assignedTo;
    } else if (isOwner) {
      const userCompany = req.user.company;
      if (userCompany) query.company = userCompany;
      if (assignedTo) query.assignedTo = assignedTo;
    } else {
      const userCompany = req.user.company;
      if (userCompany) query.company = userCompany;
      query.$or = [{ assignedTo: userId }, { createdBy: userId }];
    }

    if (search) query.title = { $regex: search, $options: "i" };

    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "username email")
        .populate("createdBy", "username email")
        .populate("project", "name")
        .populate("company", "name")
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Task.countDocuments(query)
    ]);

    // ✅ YOUR EXISTING: Decrypt dueDate for every task before sending to frontend
    const decryptedTasks = tasks.map(task => decryptTaskDueDate(task));

    res.json({
      data: decryptedTasks,
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
      .populate("company", "name");

    if (!task) return res.status(404).json({ message: "Task not found" });

    const oldStatus = task.status;
    const newStatus = req.body.status;

    // ✅ YOUR EXISTING fields — all unchanged
    task.status = newStatus || task.status;
    task.title = req.body.title || task.title;
    task.description = req.body.description || task.description;
    task.assignedTo = req.body.assignedTo || task.assignedTo;
    task.priority = req.body.priority || task.priority;
    if (req.body.company) task.company = req.body.company;

    // ✅ YOUR EXISTING: Encrypt dueDate on update
    if (req.body.dueDate !== undefined) {
      task.dueDate = req.body.dueDate ? encrypt(req.body.dueDate) : null;
    }

    // ✅ NEW: Update hour-based scheduling fields
    const startDateChanged = req.body.startDate !== undefined;
    const estimatedHrsChanged = req.body.estimatedHours !== undefined;

    if (startDateChanged) {
      task.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    }
    if (estimatedHrsChanged) {
      task.estimatedHours = req.body.estimatedHours ? parseFloat(req.body.estimatedHours) : null;
    }

    // ✅ NEW: Recalculate endDate when estimatedHours changes
    //    For updates, we use the stored startDate (when task was originally created)
    if ((startDateChanged || estimatedHrsChanged) && task.startDate && task.estimatedHours) {
      const companyId = task.company?._id || task.company;
      const recalculated = await computeEndDate(task.startDate, task.estimatedHours, companyId);
      if (recalculated) task.endDate = recalculated.endDate;
    } else if (req.body.endDate !== undefined) {
      // Manual override
      task.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    }

    // ✅ NEW: Auto-stamp endDate when task status is set to completed
    if (newStatus && oldStatus !== newStatus && !task.endDate) {
      const completedKeywords = ["completed", "done", "closed", "resolved"];
      const isNowDone = completedKeywords.some(k => newStatus.toLowerCase().includes(k));
      if (isNowDone) task.endDate = new Date();
    }

    if (req.files && req.files.length > 0) {
      task.media = [...task.media, ...req.files.map(f => f.filename)];
    }

    await task.save();

    const label = task.type === "issue" ? "Issue" : "Task";
    const appLink = req.body.appLink || BASE_URL;

    // ✅ IMPROVED: Professional status-update email to BOTH creator AND assignee
    if (newStatus && oldStatus !== newStatus) {
      try {
        await sendTaskStatusUpdateEmail({
          task,
          updater: req.user,
          oldStatus,
          newStatus,
          appLink,
        });
      } catch (mailErr) { console.error("Status mail error:", mailErr.message); }
    }

    if (io && task.project) {
      const roomName = `project_${task.project._id || task.project}`;
      const isIssue = task.type === "issue";
      io.to(roomName).emit(isIssue ? "issueUpdated" : "taskUpdated", { task });
      if (newStatus && oldStatus !== newStatus) {
        io.to(roomName).emit(isIssue ? "issueStatusChanged" : "taskStatusChanged", {
          taskId: task._id, newStatus, message: `${label} status changed to ${newStatus}`
        });
      }
    }

    // ✅ Notification: status changed → notify creator & assignedTo
    if (newStatus && oldStatus !== newStatus) {
      const isIssue = task.type === "issue";
      const recipients = [task.createdBy?._id, task.assignedTo?._id].filter(Boolean);
      await createNotification(io, {
        userId: recipients,
        companyId: task.company,
        type: isIssue ? "issue" : "task",
        action: "status_changed",
        title: `${label} Status Updated`,
        message: `"${task.title}" status changed from ${oldStatus} → ${newStatus}`,
        refId: task._id,
        refModel: "Task",
        triggeredBy: req.user?._id,
      });
    }

    // ✅ YOUR EXISTING: Decrypt dueDate for response
    const responseTask = task.toObject();
    responseTask.dueDate = task.dueDate ? decrypt(task.dueDate) : null;

    res.json({ message: "Updated successfully", task: responseTask });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   DELETE TASK
   ✅ COMPLETELY UNCHANGED FROM YOUR ORIGINAL
================================ */
exports.deleteTask = async (req, res) => {
  try {
    const io = req.app.get("io");
    const task = await Task.findById(req.params.id).populate("company", "name");

    if (!task) return res.status(404).json({ message: "Task not found" });

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";

    if (!isAdmin) {
      const userCompany = req.user.company?.toString();
      const taskCompany = task.company?._id?.toString() || task.company?.toString();
      if (userCompany && taskCompany && userCompany !== taskCompany) {
        return res.status(403).json({ message: "You don't have authority to delete this task." });
      }
    }

    await Task.findByIdAndDelete(req.params.id);

    if (io && task.project) {
      const eventName = task.type === "issue" ? "issueDeleted" : "taskDeleted";
      io.to(`project_${task.project}`).emit(eventName, {
        taskId: req.params.id, message: `${task.type} deleted`
      });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================================
   BULK UPLOAD TASKS
   ✅ YOUR EXISTING encrypt(dueDate) logic PRESERVED
================================ */
exports.bulkUploadTasks = async (req, res) => {
  let filePath = null;
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: "No file uploaded" });

    const { project, type } = req.body;
    const company = req.body.company || req.user.company;

    if (!company) return res.status(400).json({ message: "Company ID is required for bulk upload" });

    const createdById = req.user._id || req.user.id;
    filePath = req.files[0].path;

    const workbook = XLSX.readFile(filePath);
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const tasksToInsert = sheetData.map(row => {
      const rawDueDate = row.DueDate || row.dueDate || null;
      return {
        title: row.Title || row.title,
        description: row.Description || row.description || "",
        status: row.Status || row.status || "Pending",
        priority: row.Priority || row.priority || "Normal",
        project, type: type || "task",
        createdBy: createdById,
        assignedTo: row.AssignedTo || null,
        company,
        // ✅ YOUR EXISTING: Encrypt dueDate from bulk upload too
        dueDate: rawDueDate ? encrypt(String(rawDueDate)) : null,
        // ✅ NEW: Support bulk-uploaded hour fields
        startDate: row.StartDate ? new Date(row.StartDate) : null,
        estimatedHours: row.EstimatedHours ? parseFloat(row.EstimatedHours) : null,
      };
    });

    if (tasksToInsert.length > 0) await Task.insertMany(tasksToInsert);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(201).json({ message: "Bulk upload successful", count: tasksToInsert.length });
  } catch (error) {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ message: "Bulk upload failed" });
  }
};

/* ================================
   GET MY TASKS
   ✅ YOUR EXISTING decrypt logic PRESERVED
================================ */
exports.getMyTasks = async (req, res) => {
  try {
    const { status, search, project, type, company, page = 1, limit = 10 } = req.query;
    let query = { assignedTo: req.user.id };

    if (status) query.status = status;
    if (project) query.project = project;
    if (company) query.company = company;
    query.type = type || "task";
    if (search) query.title = { $regex: search, $options: "i" };

    const p = Math.max(1, parseInt(page));
    const l = Math.max(1, parseInt(limit));

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate("assignedTo", "username email")
        .populate("createdBy", "username email")
        .populate("project", "name")
        .populate("company", "name")
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Task.countDocuments(query)
    ]);

    // ✅ YOUR EXISTING: Decrypt dueDate for every task
    const decryptedTasks = tasks.map(task => decryptTaskDueDate(task));

    res.json({
      data: decryptedTasks,
      totalRecords: total,
      totalPages: Math.ceil(total / l),
      currentPage: p
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};