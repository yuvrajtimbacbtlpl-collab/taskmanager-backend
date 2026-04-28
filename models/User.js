const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username:  { type: String, required: true },
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },
    image:     { type: String, default: "" },

    // ── Extended profile fields ──
    phone:      { type: String, default: "" },
    bio:        { type: String, default: "", maxlength: 300 },
    jobTitle:   { type: String, default: "" },
    department: { type: String, default: "" },
    location:   { type: String, default: "" },
    website:    { type: String, default: "" },
    linkedin:   { type: String, default: "" },
    twitter:    { type: String, default: "" },

    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },

    isActive: { type: Boolean, default: true },

    // Password reset
    resetOtp:       String,
    resetOtpExpire: Date,
  },
  { timestamps: true }
);

userSchema.index({ company: 1, isActive: 1 });
module.exports = mongoose.model("User", userSchema);
