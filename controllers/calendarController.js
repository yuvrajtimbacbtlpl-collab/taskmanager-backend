/**
 * controllers/calendarController.js
 * Calendar events — company owner manages, all staff notified.
 */

const CalendarEvent = require("../models/CalendarEvent");
const User          = require("../models/User");
const Company       = require("../models/Company");
const { createNotification }     = require("../utils/notificationHelper");
const { sendCalendarEventEmail } = require("../utils/calendarMailer");

/* ── role helpers ── */
const getRole = (req) => (req.user?.role?.name || req.user?.role || "").toUpperCase();
const isAdminOrOwner = (req) => ["ADMIN", "COMPANY_OWNER"].includes(getRole(req));

/* ── broadcast helper: notify + email all staff in company ── */
async function broadcastToCompany({ io, companyId, event, company, action, triggeredBy }) {
  // All active users in this company except the actor
  const staff = await User.find({
    company: companyId,
    isActive: { $ne: false },
    _id: { $ne: triggeredBy },
  }).select("_id email username").lean();

  if (!staff.length) return;

  const staffIds = staff.map((s) => s._id);

  const actionLabel =
    action === "created"   ? "created"   :
    action === "updated"   ? "updated"   : "cancelled";

  const notifTitle =
    action === "created"   ? `📅 New Event: ${event.title}`      :
    action === "updated"   ? `📝 Event Updated: ${event.title}`   :
    `❌ Event Cancelled: ${event.title}`;

  const notifMessage =
    action === "created"   ? `A new ${event.eventType} "${event.title}" has been added to the calendar.` :
    action === "updated"   ? `"${event.title}" has been updated in the company calendar.` :
    `"${event.title}" has been removed from the company calendar.`;

  // In-app notifications (socket + DB)
  await createNotification(io, {
    userId: staffIds,
    companyId,
    type: "system",
    action: actionLabel,
    title: notifTitle,
    message: notifMessage,
    refId: event._id,
    refModel: "CalendarEvent",
    triggeredBy,
  });

  // Emails (fire-and-forget, don't block response)
  for (const s of staff) {
    sendCalendarEventEmail({ toUser: s, event, company, action }).catch(() => {});
  }
}

/* ────────────────────────────────────────
   GET ALL EVENTS (paginated / range)
   GET /api/calendar?company=&month=&year=
──────────────────────────────────────── */
exports.getEvents = async (req, res) => {
  try {
    const { month, year, company: qCompany } = req.query;
    const role      = getRole(req);
    const companyId = qCompany || req.user.company;

    if (!companyId) return res.json([]);

    let query = { company: companyId };

    // Filter by month/year if provided
    if (month && year) {
      const from = new Date(Number(year), Number(month) - 1, 1);
      const to   = new Date(Number(year), Number(month),     0, 23, 59, 59);
      query.startDate = { $lte: to };
      query.endDate   = { $gte: from };
    }

    const events = await CalendarEvent.find(query)
      .populate("createdBy", "username email")
      .sort({ startDate: 1 })
      .lean();

    res.json(events);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ────────────────────────────────────────
   CREATE EVENT
   POST /api/calendar
──────────────────────────────────────── */
exports.createEvent = async (req, res) => {
  try {
    if (!isAdminOrOwner(req))
      return res.status(403).json({ message: "Only Company Owner or Admin can create events." });

    const io = req.app.get("io");
    const {
      title, description, eventType,
      startDate, endDate, startTime, endTime, isAllDay, color,
      company: bodyCompany,
    } = req.body;

    if (!title || !startDate)
      return res.status(400).json({ message: "Title and Start Date are required." });

    const companyId = bodyCompany || req.user.company;
    if (!companyId)
      return res.status(400).json({ message: "Company ID is required." });

    const company = await Company.findById(companyId).lean();
    if (!company) return res.status(404).json({ message: "Company not found." });

    const event = await CalendarEvent.create({
      company:     companyId,
      createdBy:   req.user._id || req.user.id,
      title,
      description: description || "",
      eventType:   eventType   || "event",
      startDate:   new Date(startDate),
      endDate:     endDate ? new Date(endDate) : new Date(startDate),
      startTime:   startTime || null,
      endTime:     endTime   || null,
      isAllDay:    isAllDay !== false,
      color:       color     || null,
    });

    await event.populate("createdBy", "username email");

    // Broadcast socket event to company room
    io?.to(`company_${companyId}`).emit("calendarEventCreated", { event });

    // Notify + email all staff
    broadcastToCompany({
      io, companyId, event, company,
      action: "created",
      triggeredBy: req.user._id || req.user.id,
    }).catch((e) => console.error("broadcast error:", e.message));

    res.status(201).json({ message: "Event created successfully", event });
  } catch (err) {
    console.error("createEvent error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ────────────────────────────────────────
   UPDATE EVENT
   PUT /api/calendar/:id
──────────────────────────────────────── */
exports.updateEvent = async (req, res) => {
  try {
    if (!isAdminOrOwner(req))
      return res.status(403).json({ message: "Only Company Owner or Admin can update events." });

    const io = req.app.get("io");
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found." });

    const {
      title, description, eventType,
      startDate, endDate, startTime, endTime, isAllDay, color,
    } = req.body;

    if (title)       event.title       = title;
    if (description !== undefined) event.description = description;
    if (eventType)   event.eventType   = eventType;
    if (startDate)   event.startDate   = new Date(startDate);
    if (endDate)     event.endDate     = new Date(endDate);
    if (startTime !== undefined) event.startTime = startTime || null;
    if (endTime   !== undefined) event.endTime   = endTime   || null;
    if (isAllDay  !== undefined) event.isAllDay  = isAllDay;
    if (color     !== undefined) event.color     = color     || null;

    await event.save();
    await event.populate("createdBy", "username email");

    const companyId = event.company.toString();
    const company   = await Company.findById(companyId).lean();

    io?.to(`company_${companyId}`).emit("calendarEventUpdated", { event });

    broadcastToCompany({
      io, companyId, event, company,
      action: "updated",
      triggeredBy: req.user._id || req.user.id,
    }).catch((e) => console.error("broadcast error:", e.message));

    res.json({ message: "Event updated successfully", event });
  } catch (err) {
    console.error("updateEvent error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ────────────────────────────────────────
   DELETE EVENT
   DELETE /api/calendar/:id
──────────────────────────────────────── */
exports.deleteEvent = async (req, res) => {
  try {
    if (!isAdminOrOwner(req))
      return res.status(403).json({ message: "Only Company Owner or Admin can delete events." });

    const io    = req.app.get("io");
    const event = await CalendarEvent.findById(req.params.id).populate("createdBy", "username email");
    if (!event) return res.status(404).json({ message: "Event not found." });

    const companyId = event.company.toString();
    const company   = await Company.findById(companyId).lean();

    // Broadcast before delete so we still have the doc
    io?.to(`company_${companyId}`).emit("calendarEventDeleted", { eventId: event._id });

    broadcastToCompany({
      io, companyId, event, company,
      action: "cancelled",
      triggeredBy: req.user._id || req.user.id,
    }).catch((e) => console.error("broadcast error:", e.message));

    await CalendarEvent.findByIdAndDelete(req.params.id);

    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error("deleteEvent error:", err);
    res.status(500).json({ message: err.message });
  }
};