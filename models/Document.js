const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    title:       { type: String, default: "Untitled Document" },
    description: { type: String, default: "" },

    // ✅ Total pages count (kept in sync)
    pageCount: { type: Number, default: 1 },

    // ✅ Page size saved per document
    pageSize: { type: String, default: "A4" },

    // ✅ Doc type: "docs" | "txt" | uploaded file mime
    fileType: { type: String, default: "docs" },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
    },

    fileUrl: { type: String }, // uploaded files only

    isEditorGenerated: { type: Boolean, default: false },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    allowedUsers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],

    accessRequests: [
      {
        user:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["pending","approved","rejected"], default: "pending" },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);