/**
 * utils/calendarMailer.js
 * Professional email for calendar events (create / update / delete)
 */

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

/* ── helpers ── */
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const TYPE_META = {
  holiday:      { icon: "🏖️",  label: "Holiday",       bg: "#dcfce7", color: "#166534", hdr: "#16a34a" },
  "off-day":    { icon: "🔴",  label: "Day Off",        bg: "#fee2e2", color: "#991b1b", hdr: "#dc2626" },
  meeting:      { icon: "📅",  label: "Meeting",        bg: "#dbeafe", color: "#1e40af", hdr: "#2563eb" },
  festival:     { icon: "🎉",  label: "Festival",       bg: "#fef9c3", color: "#854d0e", hdr: "#d97706" },
  announcement: { icon: "📢",  label: "Announcement",   bg: "#f3e8ff", color: "#6b21a8", hdr: "#7c3aed" },
  event:        { icon: "📌",  label: "Event",          bg: "#e0f2fe", color: "#075985", hdr: "#0284c7" },
};

const badge = (type) => {
  const m = TYPE_META[type] || TYPE_META.event;
  return `<span style="display:inline-block;background:${m.bg};color:${m.color};font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">${m.icon} ${m.label}</span>`;
};

const row = (label, val) => `
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;width:38%;vertical-align:top;">
      <span style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
    </td>
    <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
      <span style="font-size:14px;color:#111827;">${val}</span>
    </td>
  </tr>`;

/**
 * Send calendar event notification email to one staff member.
 * @param {object} opts
 * @param {object} opts.toUser       - { email, username }
 * @param {object} opts.event        - CalendarEvent document
 * @param {object} opts.company      - { name }
 * @param {string} opts.action       - "created" | "updated" | "cancelled"
 */
exports.sendCalendarEventEmail = async ({ toUser, event, company, action = "created" }) => {
  if (!toUser?.email) return;

  const meta = TYPE_META[event.eventType] || TYPE_META.event;
  const headerColor = meta.hdr;
  const companyName = company?.name || "Your Company";
  const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  const isSameDay =
    new Date(event.startDate).toDateString() === new Date(event.endDate).toDateString();

  const dateText = isSameDay
    ? fmtDate(event.startDate)
    : `${fmtDate(event.startDate)} – ${fmtDate(event.endDate)}`;

  const timeText = event.isAllDay
    ? "All Day"
    : `${event.startTime || "—"} → ${event.endTime || "—"}`;

  const actionLabel =
    action === "created"   ? "New Event Added"    :
    action === "updated"   ? "Event Updated"       :
    action === "cancelled" ? "Event Cancelled"     : "Event Notification";

  const actionMsg =
    action === "created"   ? `A new ${meta.label.toLowerCase()} has been added to your company calendar.` :
    action === "updated"   ? `The following event has been updated in your company calendar.` :
    action === "cancelled" ? `The following event has been <strong style="color:#dc2626;">cancelled</strong>.` :
    "Your company calendar has been updated.";

  const subjectIcon =
    action === "created" ? meta.icon :
    action === "updated" ? "📝" : "❌";

  const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

  <!-- Header -->
  <div style="background:${headerColor};padding:28px 24px;text-align:center;">
    <div style="font-size:38px;margin-bottom:8px;">${meta.icon}</div>
    <h1 style="color:white;margin:0 0 8px;font-size:20px;font-weight:800;">${companyName}</h1>
    <span style="display:inline-block;background:rgba(255,255,255,0.22);color:white;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;">${actionLabel}</span>
  </div>

  <!-- Body -->
  <div style="padding:30px 30px 24px;">
    <p style="font-size:16px;color:#111827;margin:0 0 4px;">Hello <strong>${toUser.username || toUser.email}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">${actionMsg}</p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Event", `<strong>${event.title}</strong>`)}
        ${row("Type", badge(event.eventType))}
        ${row("Date", dateText)}
        ${row("Time", timeText)}
        ${row("Company", companyName)}
        ${event.description ? row("Details", `<span style="color:#374151;">${event.description}</span>`) : ""}
      </table>
    </div>

    ${action === "cancelled" ? `
    <div style="background:#fee2e2;border-left:4px solid #dc2626;border-radius:4px;padding:14px 18px;margin-bottom:8px;">
      <p style="margin:0;font-size:13px;color:#991b1b;"><strong>⚠️ Note:</strong> This event has been removed from the calendar. Normal working schedule applies unless notified otherwise.</p>
    </div>` : `
    <div style="background:#eff6ff;border-left:4px solid ${headerColor};border-radius:4px;padding:14px 18px;margin-bottom:8px;">
      <p style="margin:0;font-size:13px;color:#1e3a5f;"><strong>💡 Note:</strong> Please plan accordingly. Check the company calendar for all upcoming events and schedule changes.</p>
    </div>`}

    <div style="text-align:center;margin:28px 0 10px;">
      <a href="${appUrl}/dashboard" style="display:inline-block;background:${headerColor};color:white;padding:13px 36px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;">View on Dashboard</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#6b7280;">This is an automated message from <strong>Task Manager</strong>. Please do not reply.</p>
  </div>
</div>`;

  try {
    await transporter.sendMail({
      from: `"Task Manager" <${process.env.EMAIL_USER}>`,
      to: toUser.email,
      subject: `${subjectIcon} ${actionLabel}: ${event.title} — ${companyName}`,
      html,
    });
    console.log(`✅ Calendar email (${action}) → ${toUser.email}`);
  } catch (err) {
    console.error("❌ Calendar email failed:", err.message);
  }
};