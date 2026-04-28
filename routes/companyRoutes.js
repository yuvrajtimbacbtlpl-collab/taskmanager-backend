const express = require("express");
const router = express.Router();
const companyController = require("../controllers/companyController");
const companyAuthController = require("../controllers/companyAuthController");
const authMiddleware = require("../middleware/authMiddleware");

// Public
router.post("/public-register", companyAuthController.registerCompanyWithOwner);

// Protected
router.use(authMiddleware);

// Admin middleware helper
const adminOnly = (req, res, next) => {
  const role = (req.user.role?.name || req.user.role || "").toUpperCase();
  if (role !== "ADMIN") return res.status(403).json({ msg: "Access Denied" });
  next();
};

// Active companies
router.get("/", (req, res, next) => {
  const role = (req.user.role?.name || req.user.role || "").toUpperCase();
  if (role === "ADMIN") return companyController.getAllCompanies(req, res, next);
  if (!req.user.company) return res.json([]);
  return companyController.getCompanyById({ ...req, params: { id: req.user.company } }, res, next);
});

router.get("/all",     adminOnly, companyController.getAllCompanies);
router.get("/deleted", adminOnly, companyController.getDeletedCompanies);
router.get("/deleted-log", adminOnly, companyController.getDeletedLog);   // ✅ audit log

router.get("/:id",           companyController.getCompanyById);
router.put("/:id",           companyController.updateCompany);
router.post("/:id/holiday",  companyController.addHoliday);
router.put("/:id/restore",   adminOnly, companyController.restoreCompany);
router.delete("/:id/permanent", adminOnly, companyController.permanentDeleteCompany);
router.delete("/:id",           adminOnly, companyController.softDeleteCompany);

module.exports = router;