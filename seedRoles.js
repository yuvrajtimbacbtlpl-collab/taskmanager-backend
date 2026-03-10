require("dotenv").config();   // 👈 THIS WAS MISSING
const mongoose = require("mongoose");
const Role = require("./models/Role");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

async function seed() {
  const roles = [
    {
      name: "ADMIN",
      permissions: [
        "user.read",
        "user.create",
        "user.update",
        "user.delete",
        "project.read",
        "project.create",
        "project.update",
        "project.delete",
        "task.read",
        "task.create",
        "task.update",
        "task.delete",
        "document.read",
        "document.create",
        "document.update",
        "document.delete",
        "role.read",
        "role.create",
        "role.update",
        "role.delete",
        "permission.read",
        "permission.create",
        "permission.update",
        "permission.delete",
      ],
    },
    {
      name: "STAFF",
      permissions: [
        "user.read",
        "staff.read",
        "staff.create",
        "staff.update",
        "staff.delete",
        "project.read",
        "project.create",
        "project.update",
        "task.read",
        "task.create",
        "task.update",
        "task.delete",
        "document.read",
        "document.create",
        "document.update",
      ],
    },
  ];

  for (const roleData of roles) {
    const exists = await Role.findOne({ name: roleData.name });
    if (!exists) {
      await Role.create(roleData);
      console.log(`✅ Role ${roleData.name} created with permissions`);
    } else {
      // Update existing role with new permissions
      await Role.updateOne({ name: roleData.name }, { permissions: roleData.permissions });
      console.log(`✅ Role ${roleData.name} updated with permissions`);
    }
  }

  process.exit();
}

seed();

