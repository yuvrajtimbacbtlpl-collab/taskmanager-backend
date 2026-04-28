// controllers/timeLogController.js
// Handles: start timer, stop timer, get logs per task,
//          weekly timesheet, company-wide stats

const TimeLog  = require("../models/TimeLog");
const Task     = require("../models/Task");

/* ─── helpers ─────────────────────────────────────────────── */
const isAdmin = (user) =>
  (user?.role?.name || "").toUpperCase() === "ADMIN";

// Convert seconds → "2h 15m" label
function fmtDuration(seconds) {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/* ══════════════════════════════════════════════════════════
   POST /api/timelogs/start
   Body: { taskId }
   Starts a timer for the current user on a task.
   Only one running timer allowed per user at a time.
══════════════════════════════════════════════════════════ */
exports.startTimer = async (req, res) => {
  try {
    const userId    = req.user._id;
    const companyId = req.user.company;
    const { taskId } = req.body;

    if (!taskId) return res.status(400).json({ message: "taskId is required" });

    const task = await Task.findById(taskId).lean();
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Stop any currently running timer for this user first
    const running = await TimeLog.findOne({ user: userId, isRunning: true });
    if (running) {
      const now = new Date();
      const dur = Math.floor((now - new Date(running.startedAt)) / 1000);
      await TimeLog.findByIdAndUpdate(running._id, {
        stoppedAt: now,
        durationSeconds: dur,
        isRunning: false,
      });
    }

    // Create new running log
    const log = await TimeLog.create({
      task:      taskId,
      user:      userId,
      company:   companyId || task.company,
      project:   task.project,
      startedAt: new Date(),
      isRunning: true,
    });

    res.json({ message: "Timer started", log });
  } catch (err) {
    console.error("startTimer error:", err);
    res.status(500).json({ message: "Failed to start timer" });
  }
};

/* ══════════════════════════════════════════════════════════
   POST /api/timelogs/stop
   Body: { logId, note? }
   Stops the running timer and saves duration.
══════════════════════════════════════════════════════════ */
exports.stopTimer = async (req, res) => {
  try {
    const userId = req.user._id;
    const { logId, note } = req.body;

    // Find the running log (by id or auto-find current user's running timer)
    const query = logId
      ? { _id: logId, user: userId, isRunning: true }
      : { user: userId, isRunning: true };

    const log = await TimeLog.findOne(query);
    if (!log) return res.status(404).json({ message: "No running timer found" });

    const now = new Date();
    const dur = Math.floor((now - new Date(log.startedAt)) / 1000);

    const updated = await TimeLog.findByIdAndUpdate(
      log._id,
      {
        stoppedAt:       now,
        durationSeconds: dur,
        isRunning:       false,
        note:            note || "",
      },
      { new: true }
    ).populate("task", "title");

    res.json({
      message:  "Timer stopped",
      duration: fmtDuration(dur),
      log:      updated,
    });
  } catch (err) {
    console.error("stopTimer error:", err);
    res.status(500).json({ message: "Failed to stop timer" });
  }
};

/* ══════════════════════════════════════════════════════════
   GET /api/timelogs/running
   Returns the current user's active running timer (if any).
══════════════════════════════════════════════════════════ */
exports.getRunning = async (req, res) => {
  try {
    const log = await TimeLog.findOne({
      user:      req.user._id,
      isRunning: true,
    }).populate("task", "title project");

    res.json({ running: log || null });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch running timer" });
  }
};

/* ══════════════════════════════════════════════════════════
   GET /api/timelogs/task/:taskId
   All time logs for a specific task (any user who tracked it).
══════════════════════════════════════════════════════════ */
exports.getTaskLogs = async (req, res) => {
  try {
    const { taskId } = req.params;

    const logs = await TimeLog.find({ task: taskId, isRunning: false })
      .populate("user", "username email")
      .sort({ startedAt: -1 })
      .lean();

    // Aggregate total per user
    const totals = {};
    logs.forEach((l) => {
      const uid = String(l.user?._id);
      totals[uid] = (totals[uid] || 0) + (l.durationSeconds || 0);
    });

    const taskTotal = logs.reduce((s, l) => s + (l.durationSeconds || 0), 0);

    res.json({
      logs,
      taskTotalSeconds: taskTotal,
      taskTotalFormatted: fmtDuration(taskTotal),
      perUser: Object.entries(totals).map(([uid, secs]) => ({
        userId:    uid,
        seconds:   secs,
        formatted: fmtDuration(secs),
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch task logs" });
  }
};

/* ══════════════════════════════════════════════════════════
   GET /api/timelogs/my?week=YYYY-WW
   Current user's timesheet for a given ISO week.
   week param format: "2026-15" (year-weekNumber)
   Defaults to current week.
══════════════════════════════════════════════════════════ */
exports.getMyTimesheet = async (req, res) => {
  try {
    const userId = req.user._id;
    const { week } = req.query; // "2026-15"

    const { start, end } = parseWeekParam(week);

    const logs = await TimeLog.find({
      user:       userId,
      isRunning:  false,
      startedAt:  { $gte: start, $lte: end },
    })
      .populate("task",    "title project status priority")
      .populate("project", "name")
      .sort({ startedAt: -1 })
      .lean();

    // Group by day  { "2026-04-14": [logs] }
    const byDay = {};
    let weekTotal = 0;
    logs.forEach((l) => {
      const day = new Date(l.startedAt).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(l);
      weekTotal += l.durationSeconds || 0;
    });

    res.json({
      week:               `${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)}`,
      weekTotalSeconds:   weekTotal,
      weekTotalFormatted: fmtDuration(weekTotal),
      byDay,
      logs,
    });
  } catch (err) {
    console.error("getMyTimesheet:", err);
    res.status(500).json({ message: "Failed to fetch timesheet" });
  }
};

/* ══════════════════════════════════════════════════════════
   GET /api/timelogs/team?week=YYYY-WW&userId=xxx
   Admin only — team-wide timesheet, optionally filter by user.
══════════════════════════════════════════════════════════ */
exports.getTeamTimesheet = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: "Admin only" });
    }

    const companyId = req.query.company || req.user.company;
    const { week, userId } = req.query;
    const { start, end } = parseWeekParam(week);

    const query = {
      company:   companyId,
      isRunning: false,
      startedAt: { $gte: start, $lte: end },
    };
    if (userId) query.user = userId;

    const logs = await TimeLog.find(query)
      .populate("user",    "username email")
      .populate("task",    "title status priority")
      .populate("project", "name")
      .sort({ startedAt: -1 })
      .lean();

    // Group by user
    const byUser = {};
    logs.forEach((l) => {
      const uid = String(l.user?._id);
      if (!byUser[uid]) {
        byUser[uid] = {
          user:    l.user,
          seconds: 0,
          logs:    [],
        };
      }
      byUser[uid].seconds += l.durationSeconds || 0;
      byUser[uid].logs.push(l);
    });

    const summary = Object.values(byUser).map((u) => ({
      ...u,
      formatted: fmtDuration(u.seconds),
    }));

    const weekTotal = logs.reduce((s, l) => s + (l.durationSeconds || 0), 0);

    res.json({
      week:               `${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)}`,
      weekTotalSeconds:   weekTotal,
      weekTotalFormatted: fmtDuration(weekTotal),
      summary,
      logs,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch team timesheet" });
  }
};

/* ══════════════════════════════════════════════════════════
   DELETE /api/timelogs/:id
   Delete a specific log (own logs only, or admin).
══════════════════════════════════════════════════════════ */
exports.deleteLog = async (req, res) => {
  try {
    const log = await TimeLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: "Log not found" });

    const owns = String(log.user) === String(req.user._id);
    if (!owns && !isAdmin(req.user)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await log.deleteOne();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete log" });
  }
};

/* ─── util: parse week param → { start, end } ─────────────── */
function parseWeekParam(weekStr) {
  // weekStr: "2026-15"  → ISO week 15 of 2026
  // Returns Monday 00:00 → Sunday 23:59:59
  let start, end;

  if (weekStr && /^\d{4}-\d{1,2}$/.test(weekStr)) {
    const [year, week] = weekStr.split("-").map(Number);
    start = getMonday(year, week);
  } else {
    // Default: current week Monday
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon …
    const diff = (day === 0 ? -6 : 1 - day);
    start = new Date(now);
    start.setDate(now.getDate() + diff);
    start.setHours(0, 0, 0, 0);
  }

  end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function getMonday(year, week) {
  // ISO week: week 1 = the week containing the first Thursday of the year
  const jan4 = new Date(year, 0, 4); // Jan 4 is always in week 1
  const dayOfWeek = jan4.getDay() || 7; // Mon=1 … Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - dayOfWeek + 1);

  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}