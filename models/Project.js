const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["Business", "Development", "Marketing", "HR", "Design", "Other"],
      default: "Business",
    },

    // ✅ COMPANY REFERENCE - NEWLY ADDED
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // ✅ users mentioned with @username
    mentionedMembers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // ✅ project status
    status: {
      type: String,
      default: "Active",
    },

    // ✅ optional deadline
    dueDate: Date,

    // ✅ creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ── Soft Delete ──────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ INDEXES FOR OPTIMIZED QUERIES
projectSchema.index({ company: 1, createdAt: -1 });
projectSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model("Project", projectSchema);