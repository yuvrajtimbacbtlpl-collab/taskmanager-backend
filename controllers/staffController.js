const Role = require("../models/Role");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

/* =============================
   HELPERS
============================= */

const sanitize = (text) => text?.replace(/[<>$]/g, "").trim();

const usernameRegex = /^[a-zA-Z0-9_ ]+$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =============================
   GET STAFF
============================= */

exports.getStaff = async (req, res) => {
  try {
    const { role, search } = req.query;

    let filter = {};

    if (role) filter.role = role;

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const staff = await User.find(filter, "-password")
      .populate("role")
      .sort({ createdAt: -1 });

    const sortedStaff = staff.sort((a, b) => {
      const roleA = a.role?.name?.toUpperCase();
      const roleB = b.role?.name?.toUpperCase();

      if (roleA === "ADMIN" && roleB !== "ADMIN") return -1;
      if (roleA !== "ADMIN" && roleB === "ADMIN") return 1;
      return 0;
    });

    res.json(sortedStaff);
  } catch (err) {
    console.error("GET STAFF ERROR:", err);
    res.status(500).json({ msg: "Failed to load staff" });
  }
};

/* =============================
   CREATE STAFF
============================= */

exports.createStaff = async (req, res) => {
  try {
    const io = req.app.get("io");

    let { username, email, role } = req.body;

    username = sanitize(username);
    email = sanitize(email);

    /* ===== VALIDATION ===== */

    if (!username || !email || !role) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    if (username.length < 3 || username.length > 15) {
      return res
        .status(400)
        .json({ msg: "Username must be 3 to 15 characters" });
    }

    if (!usernameRegex.test(username)) {
      return res
        .status(400)
        .json({ msg: "Username contains invalid characters" });
    }

    if (email.length > 50) {
      return res.status(400).json({ msg: "Email too long" });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: "Invalid email format" });
    }

    const exists = await User.findOne({ email });

    if (exists) {
      return res
        .status(400)
        .json({ msg: "Staff already exists with this email" });
    }

    const staffRole = await Role.findById(role);

    if (!staffRole) {
      return res.status(404).json({ msg: "Role not found" });
    }

    /* ===== PASSWORD ===== */

    const password =
      Math.random().toString(36).slice(2, 6) +
      Math.random().toString(36).slice(2, 6);

    const hash = await bcrypt.hash(password, 10);

    /* ===== CREATE USER ===== */

    const staff = await User.create({
      username,
      email,
      password: hash,
      role: staffRole._id,
    });

    /* ===== EMAIL ===== */

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your Task Manager Login",
        html: `
          <h2>Hello ${username}</h2>
          <p>Your account has been created.</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Password:</b> ${password}</p>
          <p>Please login and change your password.</p>
        `,
      });
    } catch (mailError) {
      console.log("MAIL ERROR:", mailError.message);
    }

    if (io) io.emit("staffUpdated");

    res.status(201).json({
      msg: "Staff created successfully",
      staff,
    });
  } catch (err) {
    console.error("CREATE STAFF ERROR:", err);
    res.status(500).json({ msg: "Staff creation failed" });
  }
};

/* =============================
   UPDATE STAFF
============================= */

exports.updateStaff = async (req, res) => {
  try {
    const io = req.app.get("io");

    let { username, email, role } = req.body;

    username = sanitize(username);
    email = sanitize(email);

    if (!username) {
      return res.status(400).json({ msg: "Username required" });
    }

    const staffRole = await Role.findById(role);

    if (!staffRole) {
      return res.status(404).json({ msg: "Role not found" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { username, email, role: staffRole._id },
      { new: true }
    )
      .populate("role")
      .select("-password");

    if (!user) {
      return res.status(404).json({ msg: "Staff not found" });
    }

    if (io) io.emit("staffUpdated");

    res.json({
      msg: "Staff updated successfully",
      user,
    });
  } catch (err) {
    console.error("UPDATE STAFF ERROR:", err);
    res.status(500).json({ msg: "Update failed" });
  }
};

/* =============================
   DELETE STAFF
============================= */

exports.deleteStaff = async (req, res) => {
  try {
    const io = req.app.get("io");

    const targetUser = await User.findById(req.params.id).populate("role");

    if (!targetUser) {
      return res.status(404).json({ msg: "User not found" });
    }

    const currentUser = req.user;

    const currentRole = currentUser.role?.name?.toUpperCase();
    const targetRole = targetUser.role?.name?.toUpperCase();

    if (targetRole === "ADMIN" && currentRole !== "ADMIN") {
      return res.status(403).json({ msg: "You cannot delete admin" });
    }

    if (targetUser._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({ msg: "You cannot delete yourself" });
    }

    await targetUser.deleteOne();

    if (io) io.emit("staffUpdated");

    res.json({ msg: "User deleted successfully" });
  } catch (err) {
    console.error("DELETE STAFF ERROR:", err);
    res.status(500).json({ msg: "Delete failed" });
  }
};