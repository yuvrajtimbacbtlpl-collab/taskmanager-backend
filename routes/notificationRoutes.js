const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const ctrl = require("../controllers/notificationController");

router.use(authMiddleware);

router.get("/", ctrl.getMyNotifications);
router.get("/unread-count", ctrl.getUnreadCount);
router.put("/mark-all-read", ctrl.markAllAsRead);
router.delete("/clear-all", ctrl.clearAll);
router.put("/:id/read", ctrl.markAsRead);
router.delete("/:id", ctrl.deleteNotification);

module.exports = router;
