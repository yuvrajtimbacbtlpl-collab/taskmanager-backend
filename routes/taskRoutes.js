const router = require("express").Router();
const multer = require("multer");
const {
  getTasks,
  getMyTasks,
  createTask,
  updateTask,
  deleteTask,
  bulkUploadTasks
} = require("../controllers/taskController");
const auth = require("../middleware/authMiddleware");

// Setup Multer for media uploads
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Task Routes
router.get("/", auth, getTasks);
router.get("/my-tasks", auth, getMyTasks);
router.post("/", auth, upload.array("media", 10), createTask);
router.put("/:id", auth, upload.array("media", 10), updateTask);
router.delete("/:id", auth, deleteTask);
router.post("/bulk-upload", auth, upload.array("file", 1), bulkUploadTasks);

module.exports = router;