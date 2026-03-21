const Permission = require("../models/Permission");

/* CREATE PERMISSION */
exports.createPermission = async (req, res) => {
  try {
    let { name, value, isActive } = req.body;

    if (!name || !value) {
      return res.status(400).json({ msg: "Name and value required" });
    }

    value = value.toLowerCase().trim();

    const exists = await Permission.findOne({ value });
    if (exists) {
      return res.status(400).json({ msg: "Permission already exists" });
    }

    const permission = await Permission.create({
      name: name.trim(),
      value,
      isActive,
    });

    res.json(permission);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Permission already exists" });
    }

    res.status(500).json({ msg: "Failed to create permission" });
  }
};

/* GET ALL PERMISSIONS */
exports.getPermissions = async (req, res) => {
  try {
    const permissions = await Permission.find().sort({ createdAt: -1 });
    res.json(permissions);
  } catch (err) {
    res.status(500).json({ msg: "Failed to load permissions" });
  }
};

/* UPDATE PERMISSION */
exports.updatePermission = async (req, res) => {
  try {
    let { name, value, isActive } = req.body;

    if (!name || !value) {
      return res.status(400).json({ msg: "Name and value required" });
    }

    value = value.toLowerCase().trim();

    const exists = await Permission.findOne({
      value,
      _id: { $ne: req.params.id },
    });

    if (exists) {
      return res.status(400).json({ msg: "Permission already exists" });
    }

    const updated = await Permission.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        value,
        isActive, // ✅ THIS IS THE FIX
      },
      { new: true }
    );

    res.json(updated);
  }catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Permission already exists" });
    }

    res.status(500).json({ msg: "Failed to update permission" });
  }
};

/* DELETE PERMISSION */
exports.deletePermission = async (req, res) => {
  try {
    await Permission.findByIdAndDelete(req.params.id);
    res.json({ msg: "Permission deleted" });
  } catch {
    res.status(500).json({ msg: "Delete failed" });
  }
};
