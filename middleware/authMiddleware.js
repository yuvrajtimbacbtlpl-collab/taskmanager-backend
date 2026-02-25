const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        msg: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({
        msg: "Invalid token",
      });
    }

    const user = await User.findById(decoded.id)
      .populate({
        path: "role",
        populate: {
          path: "permissions",
        },
      })
      .select("-password");

    if (!user) {
      return res.status(401).json({
        msg: "User not found",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        msg: "Account disabled",
      });
    }

    // ✅ normalize role
    if (user.role?.name) {
      user.role.name = user.role.name.toUpperCase();
    }

    req.user = user;

    next();

  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err.message);

    return res.status(401).json({
      msg: "Unauthorized",
    });
  }
};