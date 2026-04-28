const express    = require("express");
const router     = express.Router();
const protect    = require("../middleware/authMiddleware");
const chatUpload = require("../middleware/chatUpload");
const {
  getMyRooms,
  getOrCreatePersonalRoom,
  createCustomGroup,
  getCompanyMembers,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  forwardMessage,
  addGroupMember,
  removeGroupMember,
} = require("../controllers/chatController");

router.use(protect);

// Rooms
router.get("/rooms",                          getMyRooms);
router.get("/members",                        getCompanyMembers);
router.post("/rooms/personal/:otherUserId",   getOrCreatePersonalRoom);
router.post("/rooms/group",                   createCustomGroup);

// Group member management
router.post("/rooms/:roomId/members",         addGroupMember);
router.delete("/rooms/:roomId/members/:userId", removeGroupMember);

// Messages
router.get("/rooms/:roomId/messages",         getMessages);
router.post("/rooms/:roomId/messages",        chatUpload.single("file"), sendMessage);
router.put("/messages/:messageId",            editMessage);
router.delete("/messages/:messageId",         deleteMessage);
router.post("/messages/:messageId/forward",   forwardMessage);

module.exports = router;