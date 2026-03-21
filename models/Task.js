const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, index: true },
    description: String,

    // ✅ COMPANY REFERENCE - NEWLY ADDED
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

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

// ✅ HIGH-PERFORMANCE INDEXES
taskSchema.index({ company: 1, project: 1, type: 1, createdAt: -1 });
taskSchema.index({ company: 1, assignedTo: 1 });
taskSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model("Task", taskSchema);