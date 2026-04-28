const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const staffController = require("../controllers/staffController");
const authMiddleware = require("../middleware/authMiddleware");
const requirePermission = require("../middleware/permissionMiddleware");

// ================= AUTH =================
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ✅ VERIFY PASSWORD ROUTE
router.post(
  "/verify-password",
  authMiddleware,
  authController.verifyAdminPassword
);

// ================= PROFILE =================
router.get("/me", authMiddleware, authController.getMe);

// ================= STAFF =================
router.get(
  "/staff",
  authMiddleware,
  requirePermission("staff.read"),
  staffController.getStaff
);

router.post(
  "/staff",
  authMiddleware,
  requirePermission("staff.create"),
  staffController.createStaff
);

router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

router.put(
  "/staff/:id",
  authMiddleware,
  requirePermission("staff.update"),
  staffController.updateStaff
);

router.delete(
  "/staff/:id",
  authMiddleware,
  requirePermission("staff.delete"),
  staffController.deleteStaff
);

module.exports = router;