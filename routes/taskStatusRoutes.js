const express = require("express");
const router = express.Router();

const controller = require("../controllers/taskStatusController");

router.get("/", controller.getAllStatus);
router.get("/active", controller.getActiveStatus);

router.post("/", controller.createStatus);
router.put("/:id", controller.updateStatus);
router.delete("/:id", controller.deleteStatus);

module.exports = router;
