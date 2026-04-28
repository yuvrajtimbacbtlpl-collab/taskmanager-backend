const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, default: "" },

    // ✅ Edit tracking
    isEdited:  { type: Boolean, default: false },
    editedAt:  { type: Date,    default: null },

    // File attachment
    file: {
      url:          { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType:     { type: String, default: null },
      size:         { type: Number, default: null },
      fileCategory: { type: String, default: null }, // "image"|"video"|"document"|"other"
    },

    // If file was auto-saved to Documents
    linkedDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },

    // ✅ Forwarded from another message
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null,
    },

    // Read receipts
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

chatMessageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);