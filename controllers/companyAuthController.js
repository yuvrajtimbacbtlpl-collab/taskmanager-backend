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

    // 2. Assign the COMPANY_OWNER role
    let role = await Role.findOne({ name: "COMPANY_OWNER" });
    
    if (!role) {
      role = await Role.create({ 
        name: "COMPANY_OWNER", 
        description: "Owner of a specific business",
        status: 1 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create the Company FIRST (before user)
    const newCompany = await Company.create({
      name: companyName,
      email: email, 
      phone,
      address,
      owner: null, // ✅ Will update after user creation
      status: 1 
    });

    // 4. Create the User WITH company field
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role._id,
      company: newCompany._id, // ✅ STORE COMPANY ID IN USER
      permissions: [],
      isActive: true
    });

    // 5. Update Company to link the Owner
    await Company.findByIdAndUpdate(
      newCompany._id,
      { $set: { owner: newUser._id } },
      { new: true }
    );

    console.log("✅ Company registered:", newCompany._id);
    console.log("✅ Owner created:", newUser._id);
    console.log("✅ Owner company field:", newUser.company);

    res.status(201).json({
      success: true,
      message: "Company and Owner registered successfully!",
      roleAssigned: "COMPANY_OWNER",
      company: {
        _id: newCompany._id,
        name: newCompany.name
      },
      owner: {
        _id: newUser._id,
        username: newUser.username,
        company: newUser.company // ✅ SHOW COMPANY IN RESPONSE
      }
    });

  } catch (error) {
    console.error("❌ Registration Error:", error);
    res.status(500).json({ message: error.message });
  }
};