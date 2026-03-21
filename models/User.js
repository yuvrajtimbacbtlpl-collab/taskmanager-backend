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
      type: String,
    },

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // ✅ PASSWORD RESET FIELDS
    resetOtp: String,
    resetOtpExpire: Date,

  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);