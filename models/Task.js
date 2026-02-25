const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: String,
    description: String,

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    status: String,

    project: {   // ✅ ADD THIS
      type: require("mongoose").Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },

    media: [String],

    priority: {
      type: String,
      default: "Normal",
    },

    dueDate: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", taskSchema);