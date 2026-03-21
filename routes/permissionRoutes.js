const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const ctrl = require("../controllers/permissionController");

router.post("/", auth, ctrl.createPermission);
router.get("/", auth, ctrl.getPermissions);
router.put("/:id", auth, ctrl.updatePermission); // ✅ ADD THIS
router.delete("/:id", auth, ctrl.deletePermission);

module.exports = router;