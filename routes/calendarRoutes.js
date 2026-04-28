const router = require("express").Router();
const auth   = require("../middleware/authMiddleware");
const {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} = require("../controllers/calendarController");

router.get("/",       auth, getEvents);
router.post("/",      auth, createEvent);
router.put("/:id",    auth, updateEvent);
router.delete("/:id", auth, deleteEvent);

module.exports = router;