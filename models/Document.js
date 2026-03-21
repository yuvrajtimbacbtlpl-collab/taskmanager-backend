const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    content: String, // <--- Added for CKEditor HTML content

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },

    fileUrl: String, // Optional for editor-generated docs
    fileType: String,

    isEditorGenerated: { // <--- Added to track if it was made in the editor
      type: Boolean,
      default: false,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    allowedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    accessRequests: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);