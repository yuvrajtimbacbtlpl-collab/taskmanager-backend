const router = require("express").Router();
const multer = require("multer");

const {
  getDocuments,
  createDocument,
  deleteDocument,
  requestAccess,
  getRequests,
  updateRequest,
  getPendingRequests,
  requestDocumentAccess,
  createInternalDocument,
  getDocumentPages,
} = require("../controllers/documentController");

const auth = require("../middleware/authMiddleware");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

/* ================= READ ================= */
router.get("/", auth, getDocuments);
router.get("/:id/pages", auth, getDocumentPages);          // ✅ get all pages for a document
router.get("/:id/requests", auth, getRequests);
router.get("/:projectId/pending-requests", auth, getPendingRequests);

/* ================= CREATE ================= */
// Standard File Upload
router.post("/", auth, upload.single("documentFile"), createDocument);

// Internal CKEditor Document
router.post("/create-internal", auth, createInternalDocument);

/* ================= UPDATE ================= */
// Update Internal Document (Auto-save)
router.put("/:id", auth, createInternalDocument);

// Update Request Status (Approve/Reject)
// frontend calls: api(`/documents/${docId}/request/${userId}`, { method: "PUT", body: { status } })
router.put("/:id/request/:userId", auth, updateRequest);

/* ================= ACTIONS / REQUESTS ================= */
// Standard Request Access
// frontend calls: api(`/documents/${id}/request`, { method: "POST" })
router.post("/:id/request", auth, requestAccess);

// Alternate/New Request Access logic
router.post("/:documentId/request-access-new", auth, requestDocumentAccess);

/* ================= DELETE ================= */
router.delete("/:id", auth, deleteDocument);

module.exports = router;