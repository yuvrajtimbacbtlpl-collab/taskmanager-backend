const User = require("../models/User");
const Role = require("../models/Role");
const bcrypt = require("bcryptjs");
const sendMail = require("../utils/sendMail");
const { addUserToCompanyGroup } = require("../utils/chatHelper");
const { createNotification } = require("../utils/notificationHelper"); // ✅ Notifications
/* ================================
   GET ALL STAFF (Company-wise)
================================ */
exports.getStaff = async (req, res) => {
  try {
    const { company, search, role, page, limit } = req.query;
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    let query = {};

    if (isAdmin) {
      // ✅ SUPER ADMIN: filter by company param (selectedCompany from header)
      // ✅ FIX: Support company=global to show all staff from all companies
      if (company && company !== "global") {
        query.company = company;
      }
      // If no company param, return empty so admin knows to pick a company
    } else {
      // ✅ COMPANY OWNER / STAFF: always scoped to their own company
      if (!req.user.company) {
        return res.json([]);
      }
      query.company = req.user.company;
    }

    if (role) query.role = role;
    if (search) query.username = { $regex: search, $options: "i" };

    // Pagination
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.max(1, parseInt(limit) || 100);

    const [staff, total] = await Promise.all([
      User.find(query)
        .select("_id username email role company createdAt isActive")
        .populate("role", "name")
        .populate("company", "name")
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l),
      User.countDocuments(query)
    ]);

    // Return paginated if page param given, else raw array
    if (page) {
      return res.json({ data: staff, total, pages: Math.ceil(total / l) });
    }
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
    const { username, email, roleId, company: bodyCompany } = req.body;
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    if (!username || !email) {
      return res.status(400).json({ message: "Username and email are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    let role = null;
    if (roleId) {
      role = await Role.findById(roleId);
      if (!role) return res.status(400).json({ message: "Role not found" });
    } else {
      role = await Role.findOne({ name: "STAFF" });
      if (!role) {
        role = await Role.create({ name: "STAFF", description: "Staff member", status: 1 });
      }
    }

    // ✅ ADMIN: uses company from request body (selected company in header)
    // ✅ Others: uses their own company
    let assignedCompany;
    if (isAdmin) {
      if (!bodyCompany) {
        return res.status(400).json({ message: "Please select a company from the header before creating staff." });
      }
      assignedCompany = bodyCompany;
    } else {
      assignedCompany = req.user.company;
    }

    const plainPassword =
      Math.random().toString(36).slice(2, 6) +
      Math.random().toString(36).slice(2, 6);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const newStaff = await User.create({
      username, email,
      password: hashedPassword,
      role: role._id,
      company: assignedCompany,
      isActive: true,
    });

    await newStaff.populate([
      { path: "role", select: "name" },
      { path: "company", select: "name" },
    ]);

    await sendMail({
      to: email,
      subject: "Welcome to Task Manager — Your Login Details",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e1e1e1; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to Task Manager</h1>
          </div>
          <div style="padding: 24px; color: #333;">
            <p>Hello <strong>${username}</strong>,</p>
            <p>Your account has been created. Here are your login credentials:</p>
            <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p style="margin: 6px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 6px 0;"><strong>Password:</strong> <code style="background:#e5e7eb; padding: 2px 6px; border-radius: 4px;">${plainPassword}</code></p>
            </div>
            <p style="color: #dc2626;">⚠️ Please login and change your password immediately.</p>
            <div style="text-align: center; margin-top: 28px;">
              <a href="${process.env.FRONTEND_URL}/login"
                 style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Login Now
              </a>
            </div>
          </div>
          <div style="background-color: #f3f4f6; padding: 14px; text-align: center; color: #6b7280; font-size: 12px;">
            This is an automated message. Please do not reply.
          </div>
        </div>
      `,
    });

    res.status(201).json({ message: "Staff member created successfully", staff: newStaff });

    // ✅ Notify the new staff member
    const io = req.app.get("io");
    await createNotification(io, {
      userId: newStaff._id,
      companyId: assignedCompany || null,
      type: "staff",
      action: "created",
      title: "Welcome to the Team! 🎉",
      message: `Your account has been created. Welcome aboard!`,
      triggeredBy: req.user?._id,
    });

    // ✅ Add new staff to company-wide chat group (fire-and-forget)
    if (assignedCompany) {
      addUserToCompanyGroup(assignedCompany, newStaff._id).catch((e) =>
        console.error("addUserToCompanyGroup error:", e.message)
      );
    }
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
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const staff = await User.findById(id)
      .select("_id username email role company createdAt")
      .populate("role", "name")
      .populate("company", "name");

    if (!staff) return res.status(404).json({ message: "Staff member not found" });

    // ✅ ADMIN can access any staff. Others restricted to their company.
    if (!isAdmin && staff.company?._id?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

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
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const staff = await User.findById(id);
    if (!staff) return res.status(404).json({ message: "Staff member not found" });

    // ✅ ADMIN can update any staff. Others restricted to their company.
    if (!isAdmin && staff.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (username) staff.username = username;
    if (email) staff.email = email;
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) return res.status(400).json({ message: "Role not found" });
      staff.role = roleId;
    }

    await staff.save();
    await staff.populate([
      { path: "role", select: "name" },
      { path: "company", select: "name" },
    ]);

    res.json({ message: "Staff member updated successfully", staff });
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
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const staff = await User.findById(id);
    if (!staff) return res.status(404).json({ message: "Staff member not found" });

    // ✅ ADMIN can delete any staff. Others restricted to their company.
    if (!isAdmin && staff.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (staff._id.toString() === req.user.id) {
      return res.status(400).json({ message: "Cannot delete yourself" });
    }

    await User.findByIdAndDelete(id);
    res.json({ message: "Staff member deleted successfully" });
  } catch (error) {
    console.error("❌ Delete staff error:", error);
    res.status(500).json({ message: error.message });
  }
};
