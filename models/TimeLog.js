// models/TimeLog.js
// Stores every time tracking session for a task
// One "session" = one Start → Stop pair per user per task

const mongoose = require("mongoose");

const timeLogSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      index: true,
    },

    startedAt: { type: Date, required: true },
    stoppedAt: { type: Date, default: null },

    // Duration in seconds — set when timer is stopped
    durationSeconds: { type: Number, default: 0 },

    // Optional note the user adds when stopping
    note: { type: String, default: "" },

    // true while the timer is still running (no stoppedAt yet)
    isRunning: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Fast queries for "my running timer" and "task total time"
timeLogSchema.index({ user: 1, isRunning: 1 });
timeLogSchema.index({ task: 1, user: 1 });
timeLogSchema.index({ company: 1, user: 1, startedAt: -1 });

module.exports = mongoose.model("TimeLog", timeLogSchema);