const Role = require("../models/Role");

/* CREATE ROLE */
/* CREATE ROLE */
exports.createRole = async (req, res) => {
  try {
    let { name, permissions } = req.body;

    if (!name)
      return res.status(400).json({ msg: "Role name required" });

    name = name.toUpperCase();

    const exists = await Role.findOne({ name });
    if (exists)
      return res.status(400).json({ msg: "Role already exists" });

    const role = await Role.create({
      name,
      permissions: Array.isArray(permissions) ? permissions : [],
    });

    res.json(role);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to create role" });
  }
};


/* GET ALL ROLES */
exports.getRoles = async (req, res) => {
  try {
    const roles = await Role.find();
    res.json(roles);
  } catch (err) {
    res.status(500).json({ msg: "Failed to load roles" });
  }
};

/* GET SINGLE ROLE */
exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ msg: "Role not found" });
    }

    res.json(role);
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch role" });
  }
};

/* UPDATE ROLE PERMISSIONS */
exports.updateRolePermissions = async (req, res) => {
  try {
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        msg: "Permissions must be array",
      });
    }

    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ msg: "Role not found" });
    }

    role.permissions = permissions;

    await role.save();

    res.json({
      msg: "Permissions updated successfully",
      role,
    });
  } catch (err) {
    console.error("UPDATE PERMISSIONS ERROR:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



/* DELETE ROLE */
exports.deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role)
      return res.status(404).json({ msg: "Role not found" });

    if (role.name === "ADMIN")
      return res.status(400).json({
        msg: "Admin role cannot be deleted",
      });

    await role.deleteOne();

    res.json({ msg: "Role deleted" });
  } catch {
    res.status(500).json({ msg: "Failed to delete role" });
  }
};