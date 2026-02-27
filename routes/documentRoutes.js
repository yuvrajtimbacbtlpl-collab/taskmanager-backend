const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const {
  getDocuments,
  uploadDocument,
  requestAccess
} = require("../controllers/documentController");

const authMiddleware = require("../middleware/authMiddleware"); // ✅ default import

// Debug: confirm functions
console.log("authMiddleware:", typeof authMiddleware);
console.log("getDocuments:", typeof getDocuments);
console.log("uploadDocument:", typeof uploadDocument);
console.log("requestAccess:", typeof requestAccess);

// Routes
router.get("/", authMiddleware, getDocuments);
router.post("/", authMiddleware, upload.single("file"), uploadDocument);
router.post("/:id/request-access", authMiddleware, requestAccess);

module.exports = router;