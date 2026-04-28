// Backend middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ msg: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({ msg: "Invalid token" });
    }

    // Optimization: Only populate what is strictly necessary
    // Added .lean() to make the query faster and reduce memory usage
    const user = await User.findById(decoded.id)
      .populate({
        path: "role",
        select: "name permissions", 
        populate: {
          path: "permissions",
          select: "name"
        },
      })
      .select("-password")
      .lean(); 

    if (!user) {
      return res.status(401).json({ msg: "User not found" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ msg: "Account disabled" });
    }

    // Normalize role name
    if (user.role?.name) {
      user.role.name = user.role.name.toUpperCase();
    }

    req.user = user;
    next(); // Move to the controller

  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err.message);
    // Ensure we return a response so the request doesn't hang
    return res.status(401).json({ msg: "Unauthorized" });
  }
};

