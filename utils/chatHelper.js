/**
 * chatHelper.js
 * Standalone helpers for auto-managing chat rooms.
 * Imported by projectController, staffController, companyAuthController.
 * Does NOT import any other controller — avoids circular dependency.
 */

const ChatRoom = require("../models/ChatRoom");
const User     = require("../models/User");

/* ============================================================
   AUTO-CREATE COMPANY GROUP
   Called when a company is registered.
============================================================ */
exports.autoCreateCompanyGroup = async (companyId, companyName) => {
  try {
    const existing = await ChatRoom.findOne({
      type: "company_group",
      company: companyId,
    });
    if (existing) return existing;

    const members = await User.find({ company: companyId }).select("_id");
    const memberIds = members.map((m) => m._id);

    const room = await ChatRoom.create({
      type: "company_group",
      name: `${companyName} — General`,
      company: companyId,
      members: memberIds,
    });

    console.log(`✅ Company chat group created: ${room.name}`);
    return room;
  } catch (err) {
    console.error("❌ autoCreateCompanyGroup error:", err.message);
    return null;
  }
};

/* ============================================================
   AUTO-CREATE PROJECT GROUP
   Called when a project is created.
============================================================ */
exports.autoCreateProjectGroup = async (project) => {
  try {
    const existing = await ChatRoom.findOne({
      type: "project_group",
      project: project._id,
    });
    if (existing) return existing;

    const room = await ChatRoom.create({
      type: "project_group",
      name: project.name,
      company: project.company,
      project: project._id,
      members: project.members || [],
      createdBy: project.createdBy,
    });

    console.log(`✅ Project chat group created: ${room.name}`);
    return room;
  } catch (err) {
    console.error("❌ autoCreateProjectGroup error:", err.message);
    return null;
  }
};

/* ============================================================
   SYNC PROJECT GROUP MEMBERS
   Called when project members are updated.
============================================================ */
exports.syncProjectGroupMembers = async (projectId, members) => {
  try {
    await ChatRoom.findOneAndUpdate(
      { type: "project_group", project: projectId },
      { $set: { members } }
    );
  } catch (err) {
    console.error("❌ syncProjectGroupMembers error:", err.message);
  }
};

/* ============================================================
   ADD USER TO COMPANY GROUP
   Called when a new staff member is created.
============================================================ */
exports.addUserToCompanyGroup = async (companyId, userId) => {
  try {
    await ChatRoom.findOneAndUpdate(
      { type: "company_group", company: companyId },
      { $addToSet: { members: userId } }
    );
  } catch (err) {
    console.error("❌ addUserToCompanyGroup error:", err.message);
  }
};
