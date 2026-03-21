const mongoose = require("mongoose");

const breakSchema = new mongoose.Schema({
  name:      { type: String, default: "Lunch Break" },
  startTime: { type: String, required: true }, 
  endTime:   { type: String, required: true }, 
});

const workingHoursSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"],
    required: true,
  },
  isWorking: { type: Boolean, default: true },
  startTime: { type: String, default: "09:00" },
  endTime:   { type: String, default: "18:00" },
  breaks:    [breakSchema],
});

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date,   required: true },
});

const companySchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, unique: true, trim: true },
    email:   { type: String, required: true, unique: true, trim: true },
    phone:   { type: String, default: "" },
    address: { type: String, default: "" },
    website: { type: String, default: "" },
    logo:    { type: String, default: "" },

    // Note: Ensure your Staff/User model name matches "User" or "Staff"
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    startDate: { type: Date, default: Date.now },
    endDate:   { type: Date, default: null },

    workingHours: {
      type: [workingHoursSchema],
      default: [
        { day: "monday",    isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
        { day: "tuesday",   isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
        { day: "wednesday", isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
        { day: "thursday",  isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
        { day: "friday",    isWorking: true,  startTime: "09:00", endTime: "18:00", breaks: [{ name: "Lunch", startTime: "13:00", endTime: "14:00" }] },
        { day: "saturday",  isWorking: false, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "sunday",    isWorking: false, startTime: "09:00", endTime: "18:00", breaks: [] },
      ],
    },

    holidays: [holidaySchema],
    status:   { type: Number, default: 1 }, 
  },
  { timestamps: true }
);

// THIS IS THE CRITICAL CHANGE
module.exports = mongoose.model("Company", companySchema);