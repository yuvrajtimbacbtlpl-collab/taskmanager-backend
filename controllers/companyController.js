// controllers/companyController.js
const Company = require("../models/Company");
const Project = require("../models/Project");
const Task = require("../models/Task");
const User = require("../models/User");
const DeletedCompanyLog = require("../models/DeletedCompanyLog");
const { createNotification } = require("../utils/notificationHelper");

/* ─── CREATE ────────────────────────────────────────────── */
exports.createCompany = async (req, res) => {
  try {
    const newCompany = new Company(req.body);
    const saved = await newCompany.save();
    const io = req.app.get("io");
    if (io) io.emit("newCompanyRegistration", { message: `New company registered: ${saved.name}`, id: saved._id });
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* ─── READ: all active ──────────────────────────────────── */
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ isDeleted: { $ne: true } }).populate("owner");
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── READ: soft-deleted (trash) ───────────────────────── */
exports.getDeletedCompanies = async (req, res) => {
  try {
    const companies = await Company.find({ isDeleted: true })
      .populate("owner")
      .populate("deletedBy", "username email")
      .sort({ deletedAt: -1 });
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── READ: permanent delete log ───────────────────────── */
exports.getDeletedLog = async (req, res) => {
  try {
    const logs = await DeletedCompanyLog.find()
      .sort({ createdAt: -1 })
      .limit(100);
    res.status(200).json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── READ: single ──────────────────────────────────────── */
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).populate("owner");
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.status(200).json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── UPDATE ────────────────────────────────────────────── */
exports.updateCompany = async (req, res) => {
  try {
    const updated = await Company.findByIdAndUpdate(
      req.params.id, { $set: req.body }, { new: true, runValidators: true }
    );
    res.status(200).json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* ─── ADD HOLIDAY ───────────────────────────────────────── */
exports.addHoliday = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    company.holidays.push(req.body);
    await company.save();
    res.status(200).json(company);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/* ─── SOFT DELETE ───────────────────────────────────────── */
exports.softDeleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).populate("owner");
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.isDeleted) return res.status(400).json({ message: "Company is already in trash" });

    const now = new Date();
    company.isDeleted = true;
    company.deletedAt = now;
    company.deletedBy = req.user?._id || null;
    await company.save();

    await Project.updateMany({ company: company._id }, { $set: { isDeleted: true, deletedAt: now } });
    await Task.updateMany({ company: company._id }, { $set: { isDeleted: true, deletedAt: now } });
    await User.updateMany({ company: company._id }, { $set: { isActive: false } });

    const io = req.app.get("io");
    if (io) io.emit("companyDeleted", { companyId: company._id, companyName: company.name });

    res.status(200).json({
      message: `"${company.name}" moved to trash. All related data deactivated.`,
      companyId: company._id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── RESTORE ───────────────────────────────────────────── */
exports.restoreCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (!company.isDeleted) return res.status(400).json({ message: "Company is not in trash" });

    company.isDeleted = false;
    company.deletedAt = null;
    company.deletedBy = null;
    await company.save();

    await Project.updateMany({ company: company._id, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null } });
    await Task.updateMany({ company: company._id, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null } });
    await User.updateMany({ company: company._id }, { $set: { isActive: true } });

    const io = req.app.get("io");
    if (io) io.emit("companyRestored", { companyId: company._id, companyName: company.name });

    res.status(200).json({
      message: `"${company.name}" restored successfully. All data is active again.`,
      company,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─── PERMANENT DELETE ──────────────────────────────────── */
exports.permanentDeleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).populate("owner");
    if (!company) return res.status(404).json({ message: "Company not found" });

    // Count related data before wiping
    const [projectCount, taskCount, staffCount] = await Promise.all([
      Project.countDocuments({ company: company._id }),
      Task.countDocuments({ company: company._id }),
      User.countDocuments({ company: company._id }),
    ]);

    // Save audit log BEFORE deleting
    await DeletedCompanyLog.create({
      originalId: company._id,
      name: company.name,
      email: company.email || company.companyEmail || "",
      phone: company.phone || "",
      projectCount,
      taskCount,
      staffCount,
      ownerName: company.owner?.username || "",
      ownerEmail: company.owner?.email || "",
      companyCreatedAt: company.createdAt,
      softDeletedAt: company.deletedAt,
      permanentlyDeletedBy: req.user?._id || null,
      permanentlyDeletedByName: req.user?.username || "Super Admin",
    });

    // Cascade hard delete
    await Project.deleteMany({ company: company._id });
    await Task.deleteMany({ company: company._id });
    await User.deleteMany({ company: company._id });
    await Company.findByIdAndDelete(company._id);

    res.status(200).json({
      message: `"${company.name}" permanently deleted. ${projectCount} projects, ${taskCount} tasks, ${staffCount} staff removed.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};