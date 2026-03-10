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
} = require("../controllers/documentController");

const auth = require("../middleware/authMiddleware");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

router.get("/", auth, getDocuments);

router.post(
  "/",
  auth,
  upload.single("documentFile"),
  createDocument
);

router.delete("/:id", auth, deleteDocument);

router.post("/:id/request-access", auth, requestAccess);

router.get("/:id/requests", auth, getRequests);

router.put("/:id/request/:userId", auth, updateRequest);

router.get("/:projectId/pending-requests", auth, getPendingRequests);

router.post("/:documentId/request-access-new", auth, requestDocumentAccess);

module.exports = router;