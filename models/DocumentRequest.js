const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "pending" }, // pending / accepted / rejected
}, { timestamps: true });

module.exports = mongoose.model("DocumentRequest", RequestSchema);