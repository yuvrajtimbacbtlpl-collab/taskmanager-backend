const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Admin, Staff, User
      uppercase: true,
      trim: true,
    },
    permissions: {
      type: [String], // ✅ MUST BE STRING ARRAY
      default: []
    },
    status: {
      type: Number,
      default: 1,
      enum: [0, 1, 2]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Role", roleSchema);
