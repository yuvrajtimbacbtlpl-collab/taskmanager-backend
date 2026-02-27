const router = require("express").Router();

const auth = require("../middleware/authMiddleware");
const checkPermission = require("../middleware/permissionMiddleware");

const {
  createProject,
  getProjects,
  getProjectById,
  getProjectTeam,
  updateProject,
  deleteProject,
} = require("../controllers/projectController");

const {
  getProjectDocuments, // ✅ new controller function
} = require("../controllers/documentController");

// CREATE
router.post("/", auth, checkPermission("project.create"), createProject);

// READ
router.get("/", auth, checkPermission("project.read"), getProjects);
router.get("/:id", auth, checkPermission("project.read"), getProjectById);

// TEAM
router.get("/:id/team", auth, checkPermission("project.read"), getProjectTeam);

// DOCUMENTS by project
router.get("/:id/documents", auth, checkPermission("document.read"), getProjectDocuments);

// UPDATE
router.put("/:id", auth, checkPermission("project.update"), updateProject);

// DELETE
router.delete("/:id", auth, checkPermission("project.delete"), deleteProject);

module.exports = router;