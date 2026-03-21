const TaskStatus = require("../models/TaskStatus");

/* ================= GET ALL ================= */
exports.getAllStatus = async (req, res) => {
  try {
    const data = await TaskStatus.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= GET ACTIVE ================= */
exports.getActiveStatus = async (req, res) => {
  try {
    const data = await TaskStatus.find({ isActive: true });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= CREATE ================= */
exports.createStatus = async (req, res) => {
  try {
    const status = await TaskStatus.create(req.body);
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= UPDATE ================= */
exports.updateStatus = async (req, res) => {
  try {
    const status = await TaskStatus.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= DELETE ================= */
exports.deleteStatus = async (req, res) => {
  try {
    await TaskStatus.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
