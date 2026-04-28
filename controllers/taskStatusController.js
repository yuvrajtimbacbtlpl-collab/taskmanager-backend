const { buildCompanyQuery, resolveCompanyForCreate } = require("../utils/companyFilter");
const TaskStatus = require("../models/TaskStatus");

/* ================= GET ALL STATUS ================= */
exports.getAllStatus = async (req, res) => {
  try {
    const { company: queryCompany } = req.query;
    const roleName = (req.user?.role?.name || req.user?.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const query = { ...buildCompanyQuery(req.user, queryCompany) };

    const data = await TaskStatus.find(query)
      .populate("company", "name")
      .sort({ createdAt: -1 });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= GET ACTIVE STATUS ================= */
exports.getActiveStatus = async (req, res) => {
  try {
    const { company: queryCompany } = req.query;
    const roleName = (req.user?.role?.name || req.user?.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const query = { isActive: true, ...buildCompanyQuery(req.user, queryCompany) };

    const data = await TaskStatus.find(query).populate("company", "name");
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= CREATE STATUS ================= */
exports.createStatus = async (req, res) => {
  try {
    const { name, isActive, company: bodyCompany } = req.body;
    const roleName = (req.user?.role?.name || req.user?.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const companyId = resolveCompanyForCreate(req.user, bodyCompany);

    const status = await TaskStatus.create({
      name,
      isActive: isActive !== undefined ? isActive : true,
      company: companyId,
    });

    await status.populate("company", "name");
    res.json(status);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= UPDATE STATUS ================= */
exports.updateStatus = async (req, res) => {
  try {
    const roleName = (req.user?.role?.name || req.user?.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const status = await TaskStatus.findById(req.params.id);
    if (!status) return res.status(404).json({ message: "Status not found" });

    // ✅ ADMIN can update any. Others restricted to their company.
    if (!isAdmin && status.company?.toString() !== req.user?.company?.toString()) {
      return res.status(403).json({ message: "Cannot modify another company's status" });
    }

    const updated = await TaskStatus.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate("company", "name");

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ================= DELETE STATUS ================= */
exports.deleteStatus = async (req, res) => {
  try {
    const roleName = (req.user?.role?.name || req.user?.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const status = await TaskStatus.findById(req.params.id);
    if (!status) return res.status(404).json({ message: "Status not found" });

    // ✅ ADMIN can delete any. Others restricted to their company.
    if (!isAdmin && status.company?.toString() !== req.user?.company?.toString()) {
      return res.status(403).json({ message: "Cannot delete another company's status" });
    }

    await TaskStatus.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
