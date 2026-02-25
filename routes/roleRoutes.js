const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const ctrl = require("../controllers/roleController");

// CREATE ROLE
router.post("/", auth, ctrl.createRole);

// GET ALL ROLES
router.get("/", auth, ctrl.getRoles);

// GET SINGLE ROLE BY ID  ✅ FIXED
router.get("/:id", auth, ctrl.getRoleById);

// UPDATE ROLE PERMISSIONS
router.put("/:id/permissions", auth, ctrl.updateRolePermissions);

// DELETE ROLE (optional but recommended)
router.delete("/:id", auth, ctrl.deleteRole);

module.exports = router;