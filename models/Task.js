// models/Task.js
// CHANGES FROM ORIGINAL:
//   - dueDate kept as String (AES-256-CBC encrypted storage) ✅ unchanged
//   - startDate added: Date — when work actually begins (company start time of that day)
//   - endDate added: Date — auto-calculated exact datetime from estimatedHours + working schedule
//   - estimatedHours added: Number — total working hours needed (e.g. 2.5, 8, 16)

const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, index: true },
    description: String,

    // ✅ COMPANY REFERENCE
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

    // ✅ KEPT AS STRING — stores AES-256-CBC encrypted ciphertext ("ivHex:ciphertextHex")
    //    API always returns decrypted plain date string (YYYY-MM-DD)
    dueDate: { type: String, default: null },

    // ✅ NEW — Hour-based scheduling fields
    startDate: { type: Date, default: null },       // When task work begins
    endDate:   { type: Date, default: null },        // Auto-calculated exact end datetime
    estimatedHours: { type: Number, default: null }, // Total working hours needed (e.g. 2.5, 8, 16)

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

    // ── Soft Delete ──────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ HIGH-PERFORMANCE INDEXES
taskSchema.index({ company: 1, project: 1, type: 1, createdAt: -1 });
taskSchema.index({ company: 1, assignedTo: 1 });
taskSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model("Task", taskSchema);
