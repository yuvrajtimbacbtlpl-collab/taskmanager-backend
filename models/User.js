const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },


    password: {
      type: String,
      required: true,
    },

    image: {
      type: String, // Cloudinary URL
    },

    // 🔐 USER ROLE (SINGLE ROLE – CLEAN DESIGN)
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },


    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
