const mongoose = require("mongoose");

const TaskStatusSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // ✅ Company-scoped status (null = global/system status)
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TaskStatus", TaskStatusSchema);
