const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema(
  {
    // "personal" | "project_group" | "company_group" | "custom_group"
    type: {
      type: String,
      enum: ["personal", "project_group", "company_group", "custom_group"],
      required: true,
    },

    // Human-readable name (used for groups)
    name: { type: String, default: "" },

    // Avatar/icon URL (optional)
    avatar: { type: String, default: "" },

    // Company this room belongs to
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    // If type === "project_group", the linked project
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },

    // All participants
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Who created the room (for custom_group)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Last message preview for sidebar
    lastMessage: {
      text: { type: String, default: "" },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      sentAt: { type: Date, default: null },
      fileType: { type: String, default: null }, // "image" | "document" | null
    },

    // Unread counts per user: { userId: count }
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

chatRoomSchema.index({ company: 1, type: 1 });
chatRoomSchema.index({ members: 1 });

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
