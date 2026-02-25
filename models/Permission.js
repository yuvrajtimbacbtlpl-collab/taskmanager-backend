const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true, // remove extra spaces
    },
    value: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // always store lowercase
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Permission", permissionSchema);