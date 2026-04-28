const mongoose = require("mongoose");

// ✅ Each page of a document stored as its own record
const documentPageSchema = new mongoose.Schema(
  {
    // ✅ Parent document reference — all pages of one doc share this
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true, // fast lookup by documentId
    },

    pageNumber: {
      type: Number,
      required: true,
    },

    content: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// ✅ Compound index: fast fetch of all pages for a doc, ordered by page number
documentPageSchema.index({ documentId: 1, pageNumber: 1 });

module.exports = mongoose.model("DocumentPage", documentPageSchema);