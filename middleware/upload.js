const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* ========= CREATE UPLOAD FOLDER ========= */
const uploadPath = "uploads";
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);

/* ========= CLEAN FILE NAME ========= */
const cleanFileName = (name) => {
  const ext = path.extname(name);
  const base = path
    .basename(name, ext)
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .toLowerCase();

  return `${base}${ext}`;
};

/* ========= STORAGE ========= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + cleanFileName(file.originalname);
    cb(null, uniqueName);
  },
});

/* ========= FILE FILTER ========= */
const fileFilter = (req, file, cb) => {
  // Added support for Excel files (.xlsx and .xls)
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|webm|xlsx|xls|spreadsheetml/;
  
  const isExtensionAllowed = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const isMimeAllowed = allowedTypes.test(file.mimetype);

  if (isExtensionAllowed || isMimeAllowed) {
    cb(null, true);
  } else {
    // Providing a clearer error message
    cb(new Error("Only images, videos, and Excel files are allowed"), false);
  }
};

/* ========= MULTER INSTANCE ========= */
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

module.exports = upload;