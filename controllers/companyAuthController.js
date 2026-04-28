const User = require("../models/User");
const Company = require("../models/Company");
const Role = require("../models/Role");
const bcrypt = require("bcryptjs");
const { autoCreateCompanyGroup } = require("../utils/chatHelper");

exports.registerCompanyWithOwner = async (req, res) => {
  try {
    const { username, email, password, companyName, phone, address, workingHours } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "Email already registered" });

    const companyExists = await Company.findOne({ name: companyName });
    if (companyExists) return res.status(400).json({ message: "Company name already exists" });

    let role = await Role.findOne({ name: "COMPANY_OWNER" });
    if (!role) {
      role = await Role.create({ name: "COMPANY_OWNER", description: "Owner of a specific business", status: 1 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Use owner-provided working hours OR fall back to Mon–Fri 9–6 defaults
    const DEFAULT_WORKING_HOURS = [
      { day: "monday",    isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
      { day: "tuesday",   isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
      { day: "wednesday", isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
      { day: "thursday",  isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
      { day: "friday",    isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
      { day: "saturday",  isWorking: false, startTime: "09:00", endTime: "18:00", breaks: [] },
      { day: "sunday",    isWorking: false, startTime: "09:00", endTime: "18:00", breaks: [] },
    ];

    const finalWorkingHours =
      Array.isArray(workingHours) && workingHours.length === 7 ? workingHours : DEFAULT_WORKING_HOURS;

    const newCompany = await Company.create({
      name: companyName, email, phone, address,
      owner: null, status: 1,
      workingHours: finalWorkingHours,
    });

    const newUser = await User.create({
      username, email, password: hashedPassword,
      role: role._id, company: newCompany._id,
      permissions: [], isActive: true,
    });

    await Company.findByIdAndUpdate(newCompany._id, { $set: { owner: newUser._id } }, { new: true });

    console.log("✅ Company registered:", newCompany._id, "✅ Owner:", newUser._id);

    try { await autoCreateCompanyGroup(newCompany._id, newCompany.name); }
    catch (e) { console.error("Chat group error:", e.message); }

    res.status(201).json({
      success: true,
      message: "Company and Owner registered successfully!",
      roleAssigned: "COMPANY_OWNER",
      company: { _id: newCompany._id, name: newCompany.name, workingHours: newCompany.workingHours },
      owner: { _id: newUser._id, username: newUser.username, company: newUser.company },
    });

  } catch (error) {
    console.error("❌ Registration Error:", error);
    res.status(500).json({ message: error.message });
  }
};
