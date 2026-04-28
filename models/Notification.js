const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // Company scope (null = super admin level)
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },

    // Category: task | issue | project | chat | staff | company | system
    type: {
      type: String,
      enum: ["task", "issue", "project", "chat", "staff", "company", "system"],
      default: "system",
    },

    // Sub-action: created | updated | deleted | assigned | status_changed | message | etc.
    action: {
      type: String,
      default: "created",
    },

    title: { type: String, required: true },
    message: { type: String, required: true },

    // Optional reference IDs for deep-linking
    refId: { type: mongoose.Schema.Types.ObjectId, default: null }, // taskId, projectId, etc.
    refModel: { type: String, default: null }, // "Task", "Project", etc.

    isRead: { type: Boolean, default: false, index: true },

    // Who triggered this (actor)
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// TTL index: auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
