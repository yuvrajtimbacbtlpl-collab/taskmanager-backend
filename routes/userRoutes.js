const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

// This helps us debug in the terminal
console.log("DEBUG: userRoutes loaded");

/**
 * @route   GET /api/users
 * @desc    Get all users (Used by Dashboard for stats)
 * @access  Private (Admin & Owner)
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Safety Check: Only Level 1 (ADMIN) or Level 2 (COMPANY_OWNER) 
    // should be able to fetch the user list.
    const currentUserRole = req.user.role.name; 
    
    if (currentUserRole !== "ADMIN" && currentUserRole !== "COMPANY_OWNER") {
      return res.status(403).json({ msg: "Access Denied: Unauthorized to view user list" });
    }

    // Fetch users, populate their role, and hide passwords
    const users = await User.find()
      .populate("role")
      .select("-password")
      .lean();

    res.json(users);
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @route   PUT /api/users/:id/change-role
 * @desc    Change user role (Admin only)
 */
router.put("/:id/change-role", authMiddleware, async (req, res) => {
  try {
    if (req.user.role.name !== "ADMIN") {
      return res.status(403).json({ msg: "Access Denied: Level 1 Admin only" });
    }

    const { roleId } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { role: roleId },
      { new: true }
    ).populate("role");

    res.json({ 
      message: "User role updated successfully", 
      role: updatedUser.role.name,
      permissions: updatedUser.role.permissions 
    });

  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;