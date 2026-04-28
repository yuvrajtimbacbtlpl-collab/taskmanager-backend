// backend/scripts/fixMissingCreatedBy.js

const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");
require("dotenv").config();

async function fixMissingCreatedBy() {
  try {
    console.log("🔧 Starting migration: Fix missing createdBy field...\n");

    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/taskmanager");
    console.log("✅ Connected to MongoDB\n");

    // Find all tasks without createdBy
    const tasksWithoutCreatedBy = await Task.find({
      $or: [
        { createdBy: null },
        { createdBy: undefined },
        { createdBy: { $exists: false } }
      ]
    });

    console.log(`📊 Found ${tasksWithoutCreatedBy.length} tasks without createdBy\n`);

    if (tasksWithoutCreatedBy.length === 0) {
      console.log("✅ All tasks have createdBy field!");
      await mongoose.connection.close();
      return;
    }

    // Get first admin user as default creator
    const adminUser = await User.findOne({ role: { $exists: true } }).limit(1);
    
    if (!adminUser) {
      console.log("⚠️  No users found in database");
      await mongoose.connection.close();
      return;
    }

    console.log(`👤 Using default creator: ${adminUser.username} (${adminUser.email})\n`);

    // Update tasks
    let updated = 0;
    for (const task of tasksWithoutCreatedBy) {
      try {
        await Task.findByIdAndUpdate(
          task._id,
          { $set: { createdBy: adminUser._id } },
          { new: true }
        );
        updated++;
        console.log(`✅ Updated task: ${task.title}`);
      } catch (err) {
        console.error(`❌ Failed to update task ${task._id}:`, err.message);
      }
    }

    console.log(`\n✅ Migration complete! Updated ${updated} tasks\n`);

    // Verify the fix
    const tasksStillMissing = await Task.find({
      $or: [
        { createdBy: null },
        { createdBy: undefined },
        { createdBy: { $exists: false } }
      ]
    });

    if (tasksStillMissing.length === 0) {
      console.log("✅ Verification passed! All tasks now have createdBy field");
    } else {
      console.log(`⚠️  ${tasksStillMissing.length} tasks still missing createdBy`);
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
}

fixMissingCreatedBy();