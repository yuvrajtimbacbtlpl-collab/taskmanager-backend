const { buildCompanyQuery, resolveCompanyForCreate } = require("../utils/companyFilter");
const Role = require("../models/Role");

/* ================= CREATE ROLE ================= */
exports.createRole = async (req, res) => {
  try {
    let { name, permissions, company: bodyCompany } = req.body;

    if (!name) return res.status(400).json({ msg: "Role name required" });

    name = name.toUpperCase();

    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    // ✅ ADMIN: use company from request body (selected in header)
    // ✅ Others: use their own company
    // ✅ Use shared utility — "global" → null, ObjectId → that company, others → user's company
    const companyId = resolveCompanyForCreate(req.user, bodyCompany);

    // Check for duplicate name within same company scope
    const exists = await Role.findOne({ name, company: companyId });
    if (exists) return res.status(400).json({ msg: "Role already exists for this company" });

    const role = await Role.create({
      name,
      permissions: Array.isArray(permissions) ? permissions : [],
      company: companyId,
    });

    await role.populate("company", "name");
    res.json(role);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Failed to create role" });
  }
};

/* ================= GET ALL ROLES ================= */
exports.getRoles = async (req, res) => {
  try {
    const { company: queryCompany } = req.query;
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    // ✅ Use shared utility — handles "global", ObjectId, and non-admin scoping
    const companyFilter = buildCompanyQuery(req.user, queryCompany);
    let query = { ...companyFilter };

    const roles = await Role.find(query)
      .populate("company", "name")
      .sort({ createdAt: -1 });

    res.json(roles);
  } catch (err) {
    res.status(500).json({ msg: "Failed to load roles" });
  }
};

/* ================= GET SINGLE ROLE ================= */
exports.getRoleById = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id).populate("company", "name");
    if (!role) return res.status(404).json({ msg: "Role not found" });
    res.json(role);
  } catch (err) {
    res.status(500).json({ msg: "Failed to fetch role" });
  }
};

/* ================= UPDATE ROLE PERMISSIONS ================= */
exports.updateRolePermissions = async (req, res) => {
  try {
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ msg: "Permissions must be array" });
    }

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ msg: "Role not found" });

    role.permissions = permissions;
    await role.save();

    res.json({ msg: "Permissions updated successfully", role });
  } catch (err) {
    console.error("UPDATE PERMISSIONS ERROR:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ================= DELETE ROLE ================= */
exports.deleteRole = async (req, res) => {
  try {
    const roleName = (req.user.role?.name || req.user.role || "").toUpperCase();
    const isAdmin = roleName === "ADMIN";

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ msg: "Role not found" });

    if (role.name === "ADMIN") {
      return res.status(400).json({ msg: "Admin role cannot be deleted" });
    }

    // ✅ ADMIN can delete any role. Others only their company's roles.
    if (!isAdmin && role.company?.toString() !== req.user.company?.toString()) {
      return res.status(403).json({ msg: "You cannot delete roles from another company" });
    }

    await role.deleteOne();
    res.json({ msg: "Role deleted" });
  } catch {
    res.status(500).json({ msg: "Failed to delete role" });
  }
};
