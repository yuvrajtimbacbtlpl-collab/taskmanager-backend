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