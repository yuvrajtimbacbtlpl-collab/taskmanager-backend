const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const isProduction = process.env.NODE_ENV === "production";

/* ================= LOGIN ================= */

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email }).populate({
      path: "role",
      populate: { path: "permissions" },
    });

    if (!user) {
      return res.status(400).json({ message: "Email not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      role: {
        name: user.role?.name,
        permissions: user.role?.permissions || [],
      },
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Login failed" });
  }
};

/* ================= LOGOUT ================= */

exports.logout = (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    expires: new Date(0),
    path: "/",
  });

  res.json({ msg: "Logged out successfully" });
};

/* ================= GET LOGGED-IN USER ================= */

exports.getMe = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      role: {
        name: user.role?.name,
        permissions: user.role?.permissions || [],
      },
    });

  } catch (err) {
    console.error("GET ME ERROR:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


// ================= VERIFY ADMIN PASSWORD =================
exports.verifyAdminPassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ msg: "Password required" });
    }

    const user = await User.findById(userId);

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ msg: "Incorrect password" });
    }

    res.json({ msg: "Password verified" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Verification failed" });
  }
};