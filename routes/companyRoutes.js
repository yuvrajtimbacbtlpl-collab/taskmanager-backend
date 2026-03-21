const express = require("express");
const router = express.Router();
const companyController = require("../controllers/companyController");
const companyAuthController = require("../controllers/companyAuthController"); // Check this line
const authMiddleware = require("../middleware/authMiddleware");

// Public route for signing up
router.post("/public-register", companyAuthController.registerCompanyWithOwner);

// Protected routes (require login)
router.use(authMiddleware);

router.get("/", companyController.getAllCompanies);
router.get("/:id", companyController.getCompanyById);
router.put("/:id", companyController.updateCompany);
router.post("/:id/holiday", companyController.addHoliday);
router.delete("/:id", companyController.deleteCompany);

// routes/companyRoutes.js
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Only Admin can see all companies
    if (req.user.role.name !== "ADMIN") {
      return res.status(403).json({ msg: "Access Denied" });
    }

    const companies = await Company.find()
      .populate("owner", "username email") // ✅ Get owner's name and email
      .sort({ createdAt: -1 });

    res.json(companies);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;