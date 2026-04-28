const ChatRoom    = require("../models/ChatRoom");
const ChatMessage = require("../models/ChatMessage");
const Document    = require("../models/Document");
const User        = require("../models/User");
const Role        = require("../models/Role");
const { createNotification } = require("../utils/notificationHelper"); // ✅ Notifications
const path        = require("path");

/* ============================================================
   INTERNAL HELPERS
============================================================ */
const isAdminUser = (user) =>
  (user?.role?.name || user?.role || "").toString().toUpperCase() === "ADMIN";

const getFileCategory = (mimeType = "", originalName = "") => {
  if (/^image\//.test(mimeType)) return "image";
  if (/^video\//.test(mimeType)) return "video";
  const ext = path.extname(originalName).toLowerCase();
  if (mimeType === "application/pdf" || ext === ".pdf") return "document";
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt|ods)$/.test(ext)) return "document";
  return "other";
};

const linkFileToDocuments = async ({ file, room, senderId }) => {
  try {
    if (!room.project) return null;
    const category = getFileCategory(file.mimeType, file.originalName);
    if (category !== "document" && category !== "image") return null;
    const ext =
      path.extname(file.originalName || "").toLowerCase().replace(".", "").toUpperCase() || "FILE";
    const doc = await Document.create({
      title: file.originalName || "Chat Attachment",
      description: "Shared via Chat in project",
      fileType: ext,
      project: room.project,
      company: room.company,
      fileUrl: file.url,
      originalName: file.originalName,
      uploadedBy: senderId,
      isEditorGenerated: false,
    });
    return doc._id;
  } catch (err) {
    console.error("linkFileToDocuments error:", err.message);
    return null;
  }
};

/* ============================================================
   GET MY ROOMS
   Super admin: no company filter, sees all their rooms
============================================================ */
exports.getMyRooms = async (req, res) => {
  try {
    const userId    = req.user._id;
    const companyId = req.user.company;
    const admin     = isAdminUser(req.user);

    const query = admin || !companyId
      ? { members: userId }
      : { members: userId, company: companyId };

    const rooms = await ChatRoom.find(query)
      .populate("members", "username email image")
      .populate("project", "name type")
      .populate("lastMessage.sender", "username")
      .sort({ "lastMessage.sentAt": -1, updatedAt: -1 });

    const result = rooms.map((room) => ({
      ...room.toObject(),
      unreadCount: room.unreadCounts?.get(String(userId)) || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("getMyRooms:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   GET OR CREATE PERSONAL DM ROOM
   Super admin: use other user's company as room company
============================================================ */
exports.getOrCreatePersonalRoom = async (req, res) => {
  try {
    const myId            = req.user._id;
    const { otherUserId } = req.params;
    const admin           = isAdminUser(req.user);

    // Resolve which company to use for this room
    let companyId = req.user.company;
    if (admin || !companyId) {
      const otherUser = await User.findById(otherUserId).select("company");
      companyId = otherUser?.company;
    }
    if (!companyId) {
      return res.status(400).json({ message: "Cannot determine company for this chat" });
    }

    let room = await ChatRoom.findOne({
      type: "personal",
      members: { $all: [myId, otherUserId], $size: 2 },
    })
      .populate("members", "username email image")
      .populate("lastMessage.sender", "username");

    if (!room) {
      const created = await ChatRoom.create({
        type: "personal",
        company: companyId,
        members: [myId, otherUserId],
        createdBy: myId,
      });
      room = await ChatRoom.findById(created._id)
        .populate("members", "username email image")
        .populate("lastMessage.sender", "username");
    }

    res.json(room);
  } catch (err) {
    console.error("getOrCreatePersonalRoom:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   CREATE CUSTOM GROUP
============================================================ */
exports.createCustomGroup = async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const companyId = req.user.company;

    if (!name || !memberIds || memberIds.length < 1) {
      return res.status(400).json({ message: "Group name and members are required" });
    }

    // For super admin, derive company from first member
    let resolvedCompany = companyId;
    if (!resolvedCompany) {
      const firstMember = await User.findById(memberIds[0]).select("company");
      resolvedCompany = firstMember?.company;
    }

    const allMembers = [...new Set([String(req.user._id), ...memberIds])];

    const room = await ChatRoom.create({
      type: "custom_group",
      name,
      company: resolvedCompany,
      members: allMembers,
      createdBy: req.user._id,
    });

    const populated = await ChatRoom.findById(room._id)
      .populate("members", "username email image");

    const io = req.app.get("io");
    if (io) {
      allMembers.forEach((memberId) => {
        io.to(`user_${memberId}`).emit("newChatRoom", populated.toObject());
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("createCustomGroup:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   GET COMPANY MEMBERS
   Super admin: returns all Company Owners across all companies
============================================================ */
exports.getCompanyMembers = async (req, res) => {
  try {
    const companyId = req.user.company;
    const myId      = String(req.user._id);
    const admin     = isAdminUser(req.user);

    if (admin || !companyId) {
      // Super admin sees all company owners
      const ownerRole = await Role.findOne({ name: "COMPANY_OWNER" });
      if (!ownerRole) return res.json([]);

      const owners = await User.find({ role: ownerRole._id, isActive: true })
        .select("username email image company")
        .populate("company", "name")
        .lean();

      return res.json(owners.filter((u) => String(u._id) !== myId));
    }

    // Regular user: return same-company members
    const users = await User.find({ company: companyId, isActive: true })
      .select("username email image")
      .lean();

    res.json(users.filter((u) => String(u._id) !== myId));
  } catch (err) {
    console.error("getCompanyMembers:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   GET MESSAGES
============================================================ */
exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId     = req.user._id;
    const page       = parseInt(req.query.page) || 1;
    const limit      = 50;

    const room = await ChatRoom.findOne({ _id: roomId, members: userId });
    if (!room) return res.status(403).json({ message: "Access denied to this chat room" });

    const messages = await ChatMessage.find({ room: roomId, isDeleted: false })
      .populate("sender", "username email image")
      .populate("linkedDocument", "title fileUrl fileType")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Mark as read
    await ChatRoom.findByIdAndUpdate(roomId, {
      $set: { [`unreadCounts.${userId}`]: 0 },
    });
    await ChatMessage.updateMany(
      { room: roomId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    // ✅ Emit seen event so senders get real-time seen update
    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${roomId}`).emit("messagesRead", {
        roomId,
        userId: String(userId),
      });
    }

    res.json(messages.reverse());
  } catch (err) {
    console.error("getMessages:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   SEND MESSAGE
============================================================ */
exports.sendMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text }   = req.body;
    const userId     = req.user._id;
    const io         = req.app.get("io");

    const room = await ChatRoom.findOne({ _id: roomId, members: userId });
    if (!room) return res.status(403).json({ message: "Access denied to this chat room" });

    let fileData         = null;
    let linkedDocumentId = null;

    if (req.file) {
      const fileCategory = getFileCategory(req.file.mimetype, req.file.originalname);
      fileData = {
        url:          req.file.path,
        originalName: req.file.originalname,
        mimeType:     req.file.mimetype,
        size:         req.file.size,
        fileCategory,
      };
      linkedDocumentId = await linkFileToDocuments({ file: fileData, room, senderId: userId });
    }

    if (!text && !fileData) {
      return res.status(400).json({ message: "Message text or file is required" });
    }

    const message = await ChatMessage.create({
      room:           roomId,
      sender:         userId,
      text:           text || "",
      file:           fileData,
      linkedDocument: linkedDocumentId,
      readBy:         [userId],
    });

    await message.populate("sender", "username email image");
    if (linkedDocumentId) await message.populate("linkedDocument", "title fileUrl fileType");

    const msgObj = message.toObject();

    const unreadUpdates = {};
    room.members.forEach((memberId) => {
      if (String(memberId) !== String(userId)) {
        unreadUpdates[`unreadCounts.${memberId}`] =
          (room.unreadCounts?.get(String(memberId)) || 0) + 1;
      }
    });

    await ChatRoom.findByIdAndUpdate(roomId, {
      $set: {
        lastMessage: {
          text:     text || (fileData ? `📎 ${fileData.originalName}` : ""),
          sender:   userId,
          sentAt:   new Date(),
          fileType: fileData?.fileCategory || null,
        },
        ...unreadUpdates,
      },
    });

    if (io) {
      io.to(`chat_${roomId}`).emit("newMessage", { roomId, message: msgObj });
      const offlineMembers = room.members.filter((memberId) => String(memberId) !== String(userId));
      offlineMembers.forEach((memberId) => {
        io.to(`user_${memberId}`).emit("chatNotification", {
          roomId,
          roomName:   room.name || "Chat",
          senderName: req.user.username,
          text:       text || "Sent a file",
          roomType:   room.type,
        });
      });

      // ✅ Persist chat notification in DB for each member
      await createNotification(io, {
        userId: offlineMembers,
        companyId: room.company || null,
        type: "chat",
        action: "message",
        title: room.name ? `💬 ${room.name}` : `💬 Message from ${req.user.username}`,
        message: text ? `${req.user.username}: ${text.substring(0, 80)}` : `${req.user.username} sent a file`,
        refId: room._id,
        refModel: "ChatRoom",
        triggeredBy: userId,
      });
    }

    res.status(201).json(msgObj);
  } catch (err) {
    console.error("sendMessage:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   EDIT MESSAGE  ✅ NEW
============================================================ */
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { text }      = req.body;
    const userId        = req.user._id;

    if (!text?.trim()) return res.status(400).json({ message: "Text is required" });

    const message = await ChatMessage.findOne({
      _id: messageId,
      sender: userId,
      isDeleted: false,
    });
    if (!message) return res.status(403).json({ message: "Cannot edit this message" });
    if (message.file?.url && !message.text) {
      return res.status(400).json({ message: "Cannot edit a file-only message" });
    }

    message.text     = text.trim();
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();
    await message.populate("sender", "username email image");

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${message.room}`).emit("messageEdited", {
        messageId,
        text:     message.text,
        isEdited: true,
        editedAt: message.editedAt,
      });
    }

    res.json(message.toObject());
  } catch (err) {
    console.error("editMessage:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   DELETE MESSAGE
============================================================ */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId        = req.user._id;

    const message = await ChatMessage.findOne({ _id: messageId, sender: userId });
    if (!message) return res.status(403).json({ message: "Cannot delete this message" });

    message.isDeleted = true;
    message.text      = "";
    await message.save();

    const io = req.app.get("io");
    if (io) io.to(`chat_${message.room}`).emit("messageDeleted", { messageId });

    res.json({ message: "Message deleted" });
  } catch (err) {
    console.error("deleteMessage:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   FORWARD MESSAGE  ✅ NEW
============================================================ */
exports.forwardMessage = async (req, res) => {
  try {
    const { messageId }   = req.params;
    const { targetRoomId } = req.body;
    const userId          = req.user._id;
    const io              = req.app.get("io");

    // Verify source message exists
    const original = await ChatMessage.findOne({ _id: messageId, isDeleted: false });
    if (!original) return res.status(404).json({ message: "Message not found" });

    // Verify user is member of target room
    const targetRoom = await ChatRoom.findOne({ _id: targetRoomId, members: userId });
    if (!targetRoom) return res.status(403).json({ message: "Access denied to target room" });

    const message = await ChatMessage.create({
      room:          targetRoomId,
      sender:        userId,
      text:          original.text || "",
      file:          original.file?.url ? original.file : null,
      forwardedFrom: original._id,
      readBy:        [userId],
    });

    await message.populate("sender", "username email image");
    const msgObj = message.toObject();

    // Update last message in target room
    const unreadUpdates = {};
    targetRoom.members.forEach((memberId) => {
      if (String(memberId) !== String(userId)) {
        unreadUpdates[`unreadCounts.${memberId}`] =
          (targetRoom.unreadCounts?.get(String(memberId)) || 0) + 1;
      }
    });

    await ChatRoom.findByIdAndUpdate(targetRoomId, {
      $set: {
        lastMessage: {
          text:   `↩ ${original.text || "Forwarded file"}`,
          sender: userId,
          sentAt: new Date(),
        },
        ...unreadUpdates,
      },
    });

    if (io) {
      io.to(`chat_${targetRoomId}`).emit("newMessage", { roomId: targetRoomId, message: msgObj });
      targetRoom.members.forEach((memberId) => {
        if (String(memberId) !== String(userId)) {
          io.to(`user_${memberId}`).emit("chatNotification", {
            roomId:     targetRoomId,
            roomName:   targetRoom.name || "Chat",
            senderName: req.user.username,
            text:       "Forwarded a message",
            roomType:   targetRoom.type,
          });
        }
      });
    }

    res.status(201).json(msgObj);
  } catch (err) {
    console.error("forwardMessage:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   ADD MEMBER TO GROUP  ✅ NEW
============================================================ */
exports.addGroupMember = async (req, res) => {
  try {
    const { roomId }  = req.params;
    const { userId: newMemberId } = req.body;
    const requesterId = req.user._id;

    const room = await ChatRoom.findOne({
      _id: roomId,
      type: { $in: ["custom_group", "project_group", "company_group"] },
      members: requesterId,
    });
    if (!room) return res.status(403).json({ message: "Access denied" });

    // Only creator or admin can add members to custom_group
    const admin = isAdminUser(req.user);
    if (
      room.type === "custom_group" &&
      !admin &&
      String(room.createdBy) !== String(requesterId)
    ) {
      return res.status(403).json({ message: "Only the group creator can add members" });
    }

    if (room.members.map(String).includes(String(newMemberId))) {
      return res.status(400).json({ message: "User is already a member" });
    }

    room.members.push(newMemberId);
    await room.save();

    await room.populate("members", "username email image");

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${roomId}`).emit("groupMembersUpdated", { roomId, members: room.members });
      io.to(`user_${newMemberId}`).emit("newChatRoom", room.toObject());
    }

    res.json(room.toObject());
  } catch (err) {
    console.error("addGroupMember:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};

/* ============================================================
   REMOVE MEMBER FROM GROUP  ✅ NEW
============================================================ */
exports.removeGroupMember = async (req, res) => {
  try {
    const { roomId, userId: removeMemberId } = req.params;
    const requesterId = req.user._id;

    const room = await ChatRoom.findOne({
      _id: roomId,
      type: { $in: ["custom_group", "project_group", "company_group"] },
    });
    if (!room) return res.status(404).json({ message: "Room not found" });

    const admin = isAdminUser(req.user);
    const isCreator = String(room.createdBy) === String(requesterId);
    const isSelf    = String(removeMemberId) === String(requesterId);

    // Must be creator, admin, or removing yourself
    if (!admin && !isCreator && !isSelf) {
      return res.status(403).json({ message: "Permission denied" });
    }
    // Cannot remove the creator
    if (String(removeMemberId) === String(room.createdBy)) {
      return res.status(400).json({ message: "Cannot remove group creator" });
    }

    room.members = room.members.filter(
      (m) => String(m) !== String(removeMemberId)
    );
    await room.save();

    await room.populate("members", "username email image");

    const io = req.app.get("io");
    if (io) {
      io.to(`chat_${roomId}`).emit("groupMembersUpdated", { roomId, members: room.members });
      io.to(`user_${removeMemberId}`).emit("removedFromGroup", { roomId });
    }

    res.json(room.toObject());
  } catch (err) {
    console.error("removeGroupMember:", err.message);
    res.status(500).json({ message: "Server Error: " + err.message });
  }
};