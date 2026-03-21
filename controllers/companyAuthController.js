const User = require("../models/User");
const Company = require("../models/Company");
const Role = require("../models/Role");
const bcrypt = require("bcryptjs");

exports.registerCompanyWithOwner = async (req, res) => {
  try {
    const { username, email, password, companyName, phone, address } = req.body;

    // 1. Validation
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "Email already registered" });

    const companyExists = await Company.findOne({ name: companyName });
    if (companyExists) return res.status(400).json({ message: "Company name already exists" });

    // 2. Assign the COMPANY_OWNER role (Separated from your Super Admin 'ADMIN')
    let role = await Role.findOne({ name: "COMPANY_OWNER" });
    
    if (!role) {
      role = await Role.create({ 
        name: "COMPANY_OWNER", 
        description: "Owner of a specific business",
        status: 1 
      });
    }

    
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create the User
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role._id, 
      permissions: [],
      isActive: true
    });

    // 4. Create the Company and link the Owner
    const newCompany = await Company.create({
      name: companyName,
      email: email, 
      phone,
      address,
      owner: newUser._id, 
      status: 1 
    });

    res.status(201).json({
      success: true,
      message: "Company and Owner registered successfully!",
      roleAssigned: "COMPANY_OWNER"
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};