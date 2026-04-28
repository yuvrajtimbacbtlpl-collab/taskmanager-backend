const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ========= CREATE UPLOAD FOLDER ========= */
const uploadPath = "uploads/chat";
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

/* ========= STORAGE ========= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "")
      .toLowerCase();
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

/* ========= DETERMINE FILE CATEGORY ========= */
const getFileCategory = (mimeType, ext) => {
  if (/^image\//.test(mimeType)) return "image";
  if (/^video\//.test(mimeType)) return "video";
  if (
    mimeType === "application/pdf" ||
    /\.(pdf)$/.test(ext)
  )
    return "document";
  if (
    /\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods)$/.test(ext) ||
    /word|excel|powerpoint|spreadsheet|presentation|text/.test(mimeType)
  )
    return "document";
  return "other";
};

/* ========= FILE FILTER ========= */
const fileFilter = (req, file, cb) => {
  // Allow images, videos, documents - basically everything useful in a chat
  const allowedMime = /image|video|pdf|word|excel|powerpoint|spreadsheet|presentation|text\/plain|text\/csv|rtf|odt|ods/;
  const allowedExt = /\.(jpg|jpeg|png|gif|webp|mp4|mov|webm|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods)$/i;

  const mimeOk = allowedMime.test(file.mimetype);
  const extOk = allowedExt.test(path.extname(file.originalname));

  if (mimeOk || extOk) {
    // Attach category to request for use in controller
    file.fileCategory = getFileCategory(
      file.mimetype,
      path.extname(file.originalname).toLowerCase()
    );
    cb(null, true);
  } else {
    cb(new Error("File type not supported in chat"), false);
  }
};

/* ========= MULTER INSTANCE ========= */
const chatUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

module.exports = chatUpload;
