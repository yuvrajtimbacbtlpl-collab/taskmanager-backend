const User = require("../models/User");
const Role = require("../models/Role");
const Task = require("../models/Task");

exports.getDashboardStats = async (req, res) => {
  try {
    const totalRoles = await Role.countDocuments();
    const totalStaff = await User.countDocuments();

    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: "completed" });
    const pendingTasks = await Task.countDocuments({ status: "pending" });

    // count unique permissions from all roles
    const roles = await Role.find();
    const permissionsSet = new Set();

    roles.forEach((role) => {
      role.permissions.forEach((p) => permissionsSet.add(p));
    });

    res.json({
      totalRoles,
      totalPermissions: permissionsSet.size,
      totalStaff,
      totalTasks,
      completedTasks,
      pendingTasks,
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).json({ msg: "Failed to load dashboard data" });
  }
};
