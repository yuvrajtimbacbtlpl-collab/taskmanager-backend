// routes/timeLogRoutes.js
const router = require("express").Router();
const auth   = require("../middleware/authMiddleware");
const {
  startTimer,
  stopTimer,
  getRunning,
  getTaskLogs,
  getMyTimesheet,
  getTeamTimesheet,
  deleteLog,
} = require("../controllers/timeLogController");

// Timer control
router.post("/start",   auth, startTimer);   // POST /api/timelogs/start
router.post("/stop",    auth, stopTimer);    // POST /api/timelogs/stop
router.get("/running",  auth, getRunning);   // GET  /api/timelogs/running

// Per-task logs (all users who tracked this task)
router.get("/task/:taskId", auth, getTaskLogs); // GET /api/timelogs/task/:taskId

// Timesheets
router.get("/my",   auth, getMyTimesheet);   // GET /api/timelogs/my?week=2026-15
router.get("/team", auth, getTeamTimesheet); // GET /api/timelogs/team?week=2026-15

// Delete
router.delete("/:id", auth, deleteLog);     // DELETE /api/timelogs/:id

module.exports = router;