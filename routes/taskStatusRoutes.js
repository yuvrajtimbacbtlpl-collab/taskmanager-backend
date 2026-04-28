const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const controller = require("../controllers/taskStatusController");

// ✅ All routes protected — controller uses req.user for company filtering
router.use(authMiddleware);

router.get("/", controller.getAllStatus);
router.get("/active", controller.getActiveStatus);
router.post("/", controller.createStatus);
router.put("/:id", controller.updateStatus);
router.delete("/:id", controller.deleteStatus);

module.exports = router;
