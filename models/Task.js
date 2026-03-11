const mongoose = require("mongoose"); // Missing line that caused the crash

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, index: true },
    description: String,

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    status: { type: String, index: true },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    media: [String],

    priority: {
      type: String,
      default: "Normal",
    },

    dueDate: Date,

    type: {
      type: String,
      enum: ["task", "issue"],
      default: "task",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// High-performance index for the main table view
taskSchema.index({ project: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model("Task", taskSchema);