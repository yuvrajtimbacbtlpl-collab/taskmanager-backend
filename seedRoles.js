require("dotenv").config();   // 👈 THIS WAS MISSING
const mongoose = require("mongoose");
const Role = require("./models/Role");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

async function seed() {
  const roles = ["ADMIN", "STAFF"];

  for (const name of roles) {
    const exists = await Role.findOne({ name });
    if (!exists) {
      await Role.create({ name });
      console.log(`Role ${name} created`);
    } else {
      console.log(`Role ${name} already exists`);
    }
  }

  process.exit();
}

seed();
