const mongoose = require("mongoose");

const DocumentSchema = new mongoose.Schema({
  name: String,
  url: String,
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

module.exports = mongoose.model("Document", DocumentSchema);