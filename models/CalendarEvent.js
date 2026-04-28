const mongoose = require("mongoose");

const calendarEventSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // Event type: holiday | meeting | off-day | festival | announcement | event
    eventType: {
      type: String,
      enum: ["holiday", "meeting", "off-day", "festival", "announcement", "event"],
      default: "event",
    },

    // Date range (single day: startDate === endDate)
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },

    // Optional time (stored as "HH:MM" string, null = all-day)
    startTime: { type: String, default: null },
    endTime:   { type: String, default: null },
    isAllDay:  { type: Boolean, default: true },

    // Color tag for UI (optional override)
    color: { type: String, default: null },

    // Notification sent flag
    notificationSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

calendarEventSchema.index({ company: 1, startDate: 1 });

module.exports = mongoose.model("CalendarEvent", calendarEventSchema);