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

    // ✅ COMPANY REFERENCE - NEWLY ADDED
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
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

// ✅ INDEX FOR COMPANY-BASED QUERIES
userSchema.index({ company: 1, isActive: 1 });

module.exports = mongoose.model("User", userSchema);