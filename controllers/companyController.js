// CRITICAL: This line fixes the "Company is not defined" error
const Company = require("../models/Company");

/**
 * CREATE: Register a new company
 * Method: POST
 * Route: /api/company
 */
exports.createCompany = async (req, res) => {
  try {
    const newCompany = new Company(req.body);
    const savedCompany = await newCompany.save();
    
    // Trigger real-time notification via Socket.io
    const io = req.app.get("io");
    if (io) {
      io.emit("newCompanyRegistration", {
        message: `New company registered: ${savedCompany.name}`,
        id: savedCompany._id
      });
    }

    res.status(201).json(savedCompany);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * READ: Get all companies with owner details
 * Method: GET
 * Route: /api/company
 */
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find().populate("owner");
    res.status(200).json(companies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * READ: Get a single company by ID
 * Method: GET
 * Route: /api/company/:id
 */
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).populate("owner");
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.status(200).json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * UPDATE: Update company basic details or status
 * Method: PUT
 * Route: /api/company/:id
 */
exports.updateCompany = async (req, res) => {
  try {
    const updatedCompany = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    res.status(200).json(updatedCompany);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * UPDATE: Add a holiday to the company's holiday list
 * Method: POST
 * Route: /api/company/:id/holiday
 */
exports.addHoliday = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    
    // req.body should be { "name": "Holiday Name", "date": "YYYY-MM-DD" }
    company.holidays.push(req.body);
    await company.save();
    
    res.status(200).json(company);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * DELETE: Remove a company
 * Method: DELETE
 * Route: /api/company/:id
 */
exports.deleteCompany = async (req, res) => {
  try {
    const deleted = await Company.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.status(200).json({ message: "Company deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};