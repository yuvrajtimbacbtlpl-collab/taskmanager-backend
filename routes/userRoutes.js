const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

// This helps us debug in the terminal
console.log("DEBUG: userRoutes loaded");

/**
 * @route   GET /api/users
 * @desc    Get all users or filter by company (Used by Dashboard for stats & Project members dropdown)
 * @access  Private (Admin & Owner)
 * @query   company - Optional company ID to filter users
 * 
 * Examples:
 * GET /api/users - Get all users (dashboard)
 * GET /api/users?company=69bd29df4d792310592c632d - Get only that company's users (project dropdown)
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Get current user's role
    const currentUserRole = req.user.role.name; 
    
    // Safety Check: Only ADMIN or COMPANY_OWNER can fetch user list
    if (currentUserRole !== "ADMIN" && currentUserRole !== "COMPANY_OWNER") {
      return res.status(403).json({ msg: "Access Denied: Unauthorized to view user list" });
    }

    const { company } = req.query; // ✅ GET COMPANY FILTER FROM QUERY

    let query = {};
    
    // ✅ IF COMPANY PROVIDED, FILTER BY IT
    if (company) {
      query.company = company;
      console.log("📥 Filtering users by company:", company);
    } else if (currentUserRole === "COMPANY_OWNER") {
      // ✅ IF COMPANY_OWNER (not ADMIN), ONLY SHOW THEIR COMPANY'S USERS
      const userCompanyId = req.user?.company;
      if (userCompanyId) {
        query.company = userCompanyId;
        console.log("📥 Company owner viewing their own company users");
      }
    }

    // Fetch users with filters, populate role & company, hide passwords
    const users = await User.find(query)
      .populate("role", "name") // ✅ POPULATE ROLE
      .populate("company", "name") // ✅ POPULATE COMPANY
      .select("-password")
      .sort({ createdAt: -1 }); // ✅ NEWEST FIRST

    console.log(`✅ Found ${users.length} users`);

    res.json(users);
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get single user by ID
 * @access  Private
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("role")
      .populate("company")
      .select("-password");

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("GET USER ERROR:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @route   PUT /api/users/:id/change-role
 * @desc    Change user role (Admin only)
 * @access  Private (Admin only)
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
    )
      .populate("role")
      .populate("company");

    res.json({ 
      message: "User role updated successfully", 
      role: updatedUser.role.name,
      permissions: updatedUser.role.permissions 
    });

  } catch (error) {
    console.error("UPDATE ROLE ERROR:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @route   PUT /api/users/:id
 * @desc    Update user details
 * @access  Private
 */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { username, email } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email },
      { new: true }
    )
      .select("-password")
      .populate("role")
      .populate("company");

    if (!updatedUser) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json({ 
      message: "User updated successfully", 
      user: updatedUser 
    });

  } catch (error) {
    console.error("UPDATE USER ERROR:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
const bcrypt  = require("bcryptjs");
const upload  = require("../middleware/upload");
const path    = require("path");
const fs      = require("fs");

/**
 * GET /api/users/profile/me
 * Returns full profile of the logged-in user
 */
router.get("/profile/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password -resetOtp -resetOtpExpire")
      .populate("role", "name")
      .populate("company", "name email logo");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/users/profile/update
 * Update profile details (no password, no image here)
 */
router.put("/profile/update", authMiddleware, async (req, res) => {
  try {
    const allowed = ["username", "phone", "bio", "jobTitle", "department"];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updated = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true })
      .select("-password -resetOtp -resetOtpExpire")
      .populate("role", "name")
      .populate("company", "name email logo");

    res.json({ message: "Profile updated successfully", user: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/users/profile/avatar
 * Upload / replace profile photo
 */
router.post("/profile/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // Delete old avatar if exists
    const existing = await User.findById(req.user._id);
    if (existing?.image) {
      const oldPath = path.join("uploads", path.basename(existing.image));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const imageUrl = `uploads/${req.file.filename}`;
    const updated  = await User.findByIdAndUpdate(
      req.user._id, { image: imageUrl }, { new: true }
    ).select("-password");

    res.json({ message: "Avatar updated", imageUrl, user: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/users/profile/avatar
 * Remove profile photo
 */
router.delete("/profile/avatar", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user?.image) {
      const oldPath = path.join("uploads", path.basename(user.image));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    await User.findByIdAndUpdate(req.user._id, { image: "" });
    res.json({ message: "Avatar removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/users/profile/change-password
 * Change password (requires current password verification)
 */
router.put("/profile/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Both fields are required" });

    const user = await User.findById(req.user._id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ message: "Current password is incorrect" });

    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!strong.test(newPassword))
      return res.status(400).json({ message: "Password must be 8+ chars with uppercase, number & symbol" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});