// backend/controllers/staffController.js - FIXED VERSION

const User = require("../models/User");
const Role = require("../models/Role");

/* ================================
   GET ALL STAFF (With Company Filter)
================================ */
exports.getStaff = async (req, res) => {
  try {
    const { company, search } = req.query;

    console.log("📥 Fetching staff...");
    console.log("User company:", req.user.company);
    console.log("Query company:", company);

    // ✅ IF COMPANY IS PROVIDED, USER MUST BE FROM THAT COMPANY
    if (company) {
      const userCompanyId = req.user.company?.toString() || req.user.company;
      const queryCompanyId = company.toString() || company;

      if (userCompanyId !== queryCompanyId) {
        console.log("❌ User trying to access another company's staff");
        return res.status(403).json({ message: "Cannot access another company's staff" });
      }

      console.log("✅ User accessing their own company staff");
    }

    // ✅ BUILD QUERY
    let query = {};

    // ✅ IF COMPANY FILTER PROVIDED, USE IT
    if (company) {
      query.company = company;
      console.log("🔍 Filtering by company:", company);
    } else {
      // ✅ IF NO COMPANY FILTER, USE USER'S COMPANY
      if (req.user.company) {
        query.company = req.user.company;
        console.log("🔍 Using user's company:", req.user.company);
      }
    }

    // ✅ ADD SEARCH FILTER
    if (search) {
      query.username = { $regex: search, $options: "i" };
    }

    // ✅ FETCH STAFF
    const staff = await User.find(query)
      .select("_id username email role company createdAt")
      .populate("role", "name")
      .populate("company", "name")
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${staff.length} staff members`);

    res.json(staff);
  } catch (error) {
    console.error("❌ Get staff error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================
   CREATE STAFF
================================ */
exports.createStaff = async (req, res) => {
  try {
    const { username, email, password, roleId } = req.body;

    console.log("👤 Creating staff member:", username);

    // ✅ VALIDATE
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password required" });
    }

    // ✅ CHECK EMAIL EXISTS
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // ✅ GET ROLE
    let role = null;
    if (roleId) {
      role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({ message: "Role not found" });
      }
    } else {
      // ✅ DEFAULT ROLE
      role = await Role.findOne({ name: "STAFF" });
      if (!role) {
        role = await Role.create({
          name: "STAFF",
          description: "Staff member",
          status: 1,
        });
      }
    }

    // ✅ HASH PASSWORD
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ CREATE USER WITH COMPANY
    const newStaff = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role._id,
      company: req.user.company, // ✅ SET TO USER'S COMPANY
      isActive: true,
    });

    // ✅ POPULATE AND RETURN
    await newStaff.populate([
      { path: "role", select: "name" },
      { path: "company", select: "name" },
    ]);

    console.log("✅ Staff member created:", newStaff._id);

    res.status(201).json({
      message: "Staff member created successfully",
      staff: newStaff,
    });
  } catch (error) {
    console.error("❌ Create staff error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================
   GET STAFF BY ID
================================ */
exports.getStaffById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("📖 Getting staff:", id);

    const staff = await User.findById(id)
      .select("_id username email role company createdAt")
      .populate("role", "name")
      .populate("company", "name");

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // ✅ VERIFY COMPANY ACCESS
    if (staff.company?._id.toString() !== req.user.company?.toString()) {
      console.log("❌ User trying to access another company's staff");
      return res.status(403).json({ message: "Unauthorized" });
    }

    console.log("✅ Staff retrieved:", staff.username);

    res.json(staff);
  } catch (error) {
    console.error("❌ Get staff by ID error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================
   UPDATE STAFF
================================ */
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, roleId } = req.body;

    console.log("✏️ Updating staff:", id);

    const staff = await User.findById(id);

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // ✅ VERIFY COMPANY ACCESS
    if (staff.company?.toString() !== req.user.company?.toString()) {
      console.log("❌ User trying to update another company's staff");
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ UPDATE FIELDS
    if (username) staff.username = username;
    if (email) staff.email = email;

    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({ message: "Role not found" });
      }
      staff.role = roleId;
    }

    await staff.save();

    // ✅ POPULATE AND RETURN
    await staff.populate([
      { path: "role", select: "name" },
      { path: "company", select: "name" },
    ]);

    console.log("✅ Staff updated:", staff._id);

    res.json({
      message: "Staff member updated successfully",
      staff,
    });
  } catch (error) {
    console.error("❌ Update staff error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ================================
   DELETE STAFF
================================ */
exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🗑️ Deleting staff:", id);

    const staff = await User.findById(id);

    if (!staff) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    // ✅ VERIFY COMPANY ACCESS
    if (staff.company?.toString() !== req.user.company?.toString()) {
      console.log("❌ User trying to delete another company's staff");
      return res.status(403).json({ message: "Unauthorized" });
    }

    // ✅ PREVENT DELETING SELF
    if (staff._id.toString() === req.user.id) {
      return res.status(400).json({ message: "Cannot delete yourself" });
    }

    await User.findByIdAndDelete(id);

    console.log("✅ Staff deleted:", id);

    res.json({ message: "Staff member deleted successfully" });
  } catch (error) {
    console.error("❌ Delete staff error:", error);
    res.status(500).json({ message: error.message });
  }
};