// models/DeletedCompanyLog.js
// Stores a snapshot of every permanently deleted company for audit trail
const mongoose = require("mongoose");

const deletedCompanyLogSchema = new mongoose.Schema(
  {
    // Original company _id (just stored as reference, doc is gone)
    originalId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Snapshot of key fields at time of permanent deletion
    name:   { type: String, required: true },
    email:  { type: String, default: "" },
    phone:  { type: String, default: "" },

    // Counts at time of deletion
    projectCount: { type: Number, default: 0 },
    taskCount:    { type: Number, default: 0 },
    staffCount:   { type: Number, default: 0 },

    // Owner info snapshot
    ownerName:  { type: String, default: "" },
    ownerEmail: { type: String, default: "" },

    // When the company was first created
    companyCreatedAt: { type: Date, default: null },

    // When it was soft-deleted
    softDeletedAt: { type: Date, default: null },

    // Who permanently deleted it
    permanentlyDeletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    permanentlyDeletedByName: { type: String, default: "Super Admin" },
  },
  { timestamps: true } // createdAt = permanent delete timestamp
);

module.exports = mongoose.model("DeletedCompanyLog", deletedCompanyLogSchema);