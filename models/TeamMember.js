// models/TeamMember.js

const mongoose = require("mongoose");

const teamMemberSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    department: String,
    email: {
      type: String,
      required: true,
    },
    phone: String,
    avatar: String,

    skills: [String],

    status: {
      type: String,
      enum: ["Active", "Inactive", "On Leave"],
      default: "Active",
    },

    location: String,
    joiningDate: Date,
    bio: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("TeamMember", teamMemberSchema);
