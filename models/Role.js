const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    permissions: {
      type: [String],
      default: []
    },
    status: {
      type: Number,
      default: 1,
      enum: [0, 1, 2]
    },
    // ✅ Company-scoped roles (null = global/system role like ADMIN)
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// ✅ Compound index: role name is unique PER company (or globally if company is null)
roleSchema.index({ name: 1, company: 1 }, { unique: true });

module.exports = mongoose.model("Role", roleSchema);
