/**
 * utils/notificationHelper.js
 * Central helper to create DB notification + emit socket event to user
 */

const Notification = require("../models/Notification");

/**
 * Create a notification in DB and emit socket event to user
 *
 * @param {object} io          - Socket.io instance
 * @param {object} opts
 * @param {string} opts.userId       - Recipient user ID (can be array for multi-user)
 * @param {string} opts.companyId    - Company scope
 * @param {string} opts.type         - task | issue | project | chat | staff | company | system
 * @param {string} opts.action       - created | updated | deleted | assigned | status_changed | message
 * @param {string} opts.title        - Short title
 * @param {string} opts.message      - Full message
 * @param {string} opts.refId        - Reference doc ID (taskId, projectId, etc.)
 * @param {string} opts.refModel     - "Task" | "Project" | "Issue" | etc.
 * @param {string} opts.triggeredBy  - Actor user ID
 */
async function createNotification(io, opts) {
  const {
    userId,
    companyId = null,
    type = "system",
    action = "created",
    title,
    message,
    refId = null,
    refModel = null,
    triggeredBy = null,
  } = opts;

  // Support single userId or array
  const userIds = Array.isArray(userId) ? userId : userId ? [userId] : [];

  if (userIds.length === 0) return;

  // Remove duplicates and filter out triggeredBy (don't notify yourself)
  const recipients = [...new Set(userIds.map(String))].filter(
    (id) => !triggeredBy || String(id) !== String(triggeredBy)
  );

  if (recipients.length === 0) return;

  const notifPayload = {
    companyId,
    type,
    action,
    title,
    message,
    refId,
    refModel,
    triggeredBy,
    isRead: false,
  };

  // Create DB records for all recipients
  const docs = recipients.map((uid) => ({ ...notifPayload, userId: uid }));

  let createdNotifs = [];
  try {
    createdNotifs = await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error("createNotification insertMany error:", err.message);
    return;
  }

  // Emit socket event to each user's personal room
  if (io) {
    createdNotifs.forEach((notif) => {
      io.to(`user_${notif.userId}`).emit("newNotification", {
        _id: notif._id,
        type: notif.type,
        action: notif.action,
        title: notif.title,
        message: notif.message,
        refId: notif.refId,
        refModel: notif.refModel,
        isRead: false,
        createdAt: notif.createdAt,
      });
    });
  }
}

module.exports = { createNotification };
