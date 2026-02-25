const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const checkPermission = require("../middleware/permissionMiddleware");
const upload = require("../middleware/upload");

const {
  createTask,
  getTasks,
  getMyTasks,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

// CREATE
router.post(
  "/",
  auth,
  checkPermission("task.create"),
  upload.array("media", 5),
  createTask
);

// UPDATE
router.put(
  "/:id",
  auth,
  checkPermission("task.update"),
  upload.array("media", 5),
  updateTask
);

router.get("/", auth, checkPermission("task.read"), getTasks);
router.get("/my", auth, checkPermission("task.read"), getMyTasks);

router.delete("/:id", auth, checkPermission("task.delete"), deleteTask);

module.exports = router;