const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ─────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────── */
const fmt = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Not set";

const priorityBadge = (priority = "Normal") => {
  const map = {
    High:   { bg: "#fee2e2", color: "#991b1b", dot: "#ef4444" },
    Medium: { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
    Normal: { bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
    Low:    { bg: "#f0fdf4", color: "#166534", dot: "#22c55e" },
  };
  const c = map[priority] || map.Normal;
  return `<span style="display:inline-flex;align-items:center;gap:5px;background:${c.bg};color:${c.color};font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;"><span style="width:7px;height:7px;border-radius:50%;background:${c.dot};display:inline-block;"></span>${priority}</span>`;
};

const statusBadge = (status = "Pending") => {
  const lc = (status || "").toLowerCase();
  let bg = "#f3f4f6", color = "#374151";
  if (lc.includes("complet") || lc.includes("done") || lc.includes("closed") || lc.includes("resolved")) { bg = "#d1fae5"; color = "#065f46"; }
  else if (lc.includes("progress") || lc.includes("process") || lc.includes("review") || lc.includes("active")) { bg = "#dbeafe"; color = "#1e40af"; }
  else if (lc.includes("pending") || lc.includes("open") || lc.includes("backlog")) { bg = "#fef9c3"; color = "#854d0e"; }
  else if (lc.includes("hold") || lc.includes("block") || lc.includes("cancel")) { bg = "#fee2e2"; color = "#991b1b"; }
  return `<span style="background:${bg};color:${color};font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;">${status}</span>`;
};

const emailWrapper = ({ headerColor = "#2563eb", headerLabel, bodyHtml, ctaUrl, ctaText = "Open in Dashboard" }) => `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <div style="background:${headerColor};padding:28px 24px;text-align:center;">
    <h1 style="color:white;margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:0.3px;">Task Manager</h1>
    <span style="display:inline-block;background:rgba(255,255,255,0.22);color:white;font-size:11px;font-weight:700;padding:4px 14px;border-radius:20px;letter-spacing:1px;text-transform:uppercase;">${headerLabel}</span>
  </div>
  <div style="padding:32px 30px 24px;">
    ${bodyHtml}
    ${ctaUrl ? `
    <div style="text-align:center;margin:30px 0 10px;">
      <a href="${ctaUrl}" style="display:inline-block;background-color:${headerColor};color:white;padding:13px 36px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700;">${ctaText}</a>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:8px;">Or copy: <a href="${ctaUrl}" style="color:${headerColor};">${ctaUrl}</a></p>` : ""}
  </div>
  <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#6b7280;">This is an automated message from <strong>Task Manager</strong>. Please do not reply.</p>
  </div>
</div>`;

const detailRow = (label, valueHtml, last = false) => `
<tr>
  <td style="padding:9px 0;${last ? "" : "border-bottom:1px solid #e5e7eb;"}width:38%;vertical-align:top;">
    <span style="font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
  </td>
  <td style="padding:9px 0;${last ? "" : "border-bottom:1px solid #e5e7eb;"}vertical-align:top;">
    <span style="font-size:14px;color:#111827;">${valueHtml}</span>
  </td>
</tr>`;

/* ─────────────────────────────────────────
   1. PROJECT EMAIL  (existing — kept intact)
───────────────────────────────────────── */
exports.sendProjectEmail = async (user, project, type = "create") => {
  const isUpdate    = type === "update";
  const projectLink = `${process.env.FRONTEND_URL}/projects?id=${project._id}`;
  const memberNames =
    (project.members || [])
      .filter((m) => m._id?.toString() !== user._id?.toString())
      .map((m) => m.username || m.email)
      .join(", ") || "Just you";
  const dueDateText = fmt(project.dueDate);
  const companyName = project.company?.name || "Your Company";
  const headerColor = isUpdate ? "#f59e0b" : "#2563eb";
  const label       = isUpdate ? "PROJECT UPDATED" : "NEW PROJECT ASSIGNED";

  const bodyHtml = `
    <p style="font-size:16px;color:#111827;margin:0 0 6px;">Hello <strong>${user.username}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      ${isUpdate
        ? `The project <strong style="color:#111827;">"${project.name}"</strong> has been updated. Here are the latest details:`
        : `You have been added as a team member to <strong style="color:#111827;">"${project.name}"</strong>. Here's everything you need to know:`}
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Project", `<strong>${project.name}</strong>`)}
        ${detailRow("Company", companyName)}
        ${detailRow("Type", project.type || "—")}
        ${detailRow("Status", project.isActive !== false
          ? '<span style="background:#dcfce7;color:#166534;font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;">Active</span>'
          : '<span style="background:#fee2e2;color:#991b1b;font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;">Inactive</span>')}
        ${detailRow("Due Date", dueDateText)}
        ${detailRow("Team", memberNames)}
        ${project.description ? detailRow("Description", project.description, true) : ""}
      </table>
    </div>`;

  const html = emailWrapper({ headerColor, headerLabel: label, bodyHtml, ctaUrl: projectLink, ctaText: "🔗 Open Project" });

  try {
    await transporter.sendMail({
      from: `"Task Manager" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: isUpdate ? `📝 Project Updated: "${project.name}"` : `🚀 You've been added to "${project.name}"`,
      html,
    });
    console.log(`✅ Project email → ${user.email}`);
  } catch (error) {
    console.error("❌ Project email failed:", error.message);
  }
};

/* ─────────────────────────────────────────
   2. TASK / ISSUE ASSIGNED EMAIL
      Sent to assignee when a task/issue is created and assigned.
───────────────────────────────────────── */
exports.sendTaskAssignedEmail = async ({ assignee, creator, task, appLink }) => {
  if (!assignee?.email) return;

  const isIssue     = (task.type || "task") === "issue";
  const typeLabel   = isIssue ? "Issue" : "Task";
  const headerColor = isIssue ? "#7c3aed" : "#2563eb";
  const icon        = isIssue ? "🐛" : "✅";
  const projectName = task.project?.name || "—";
  const companyName = task.company?.name  || "—";

  const bodyHtml = `
    <p style="font-size:16px;color:#111827;margin:0 0 6px;">Hello <strong>${assignee.username || assignee.email}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      A new ${typeLabel.toLowerCase()} has been assigned to you by
      <strong style="color:#111827;">${creator?.username || "your manager"}</strong>.
      Please review the details and get started.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Title", `<strong>${task.title}</strong>`)}
        ${detailRow("Type", `${icon} ${typeLabel}`)}
        ${detailRow("Project", projectName)}
        ${detailRow("Company", companyName)}
        ${detailRow("Priority", priorityBadge(task.priority))}
        ${detailRow("Status", statusBadge(task.status))}
        ${detailRow("Due Date", fmt(task.dueDate))}
        ${detailRow("Assigned By", creator?.username || "—")}
        ${task.description ? detailRow("Description", `<span style="color:#374151;">${task.description}</span>`, true) : ""}
      </table>
    </div>
    <div style="background:#eff6ff;border-left:4px solid ${headerColor};border-radius:4px;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#1e40af;">
        <strong>💡 Next Step:</strong> Open the dashboard, review the ${typeLabel.toLowerCase()}, and update the status as you make progress.
      </p>
    </div>`;

  const html = emailWrapper({ headerColor, headerLabel: `New ${typeLabel} Assigned to You`, bodyHtml, ctaUrl: appLink || process.env.FRONTEND_URL, ctaText: `${icon} View ${typeLabel}` });

  try {
    await transporter.sendMail({
      from: `"Task Manager" <${process.env.EMAIL_USER}>`,
      to: assignee.email,
      subject: `${icon} New ${typeLabel} Assigned: "${task.title}"`,
      html,
    });
    console.log(`✅ ${typeLabel} assigned email → ${assignee.email}`);
  } catch (err) {
    console.error(`❌ ${typeLabel} assign email failed:`, err.message);
  }
};

/* ─────────────────────────────────────────
   3. TASK / ISSUE STATUS UPDATE EMAILS
      a) To CREATOR  — "X updated your task to [status]"
      b) To ASSIGNEE — notification that their task changed / confirmation of their own update
───────────────────────────────────────── */
exports.sendTaskStatusUpdateEmail = async ({ task, updater, oldStatus, newStatus, appLink }) => {
  if (!task) return;

  const isIssue   = (task.type || "task") === "issue";
  const typeLabel = isIssue ? "Issue" : "Task";
  const icon      = isIssue ? "🐛" : "✅";
  const appUrl    = appLink || process.env.FRONTEND_URL;

  const lc = (newStatus || "").toLowerCase();
  let headerColor = "#6366f1";
  if (lc.includes("complet") || lc.includes("done") || lc.includes("closed") || lc.includes("resolved")) headerColor = "#16a34a";
  else if (lc.includes("progress") || lc.includes("process") || lc.includes("review"))                   headerColor = "#2563eb";
  else if (lc.includes("hold") || lc.includes("block") || lc.includes("cancel"))                         headerColor = "#dc2626";
  else if (lc.includes("pending") || lc.includes("open"))                                                 headerColor = "#d97706";

  const sharedDetails = `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:18px 0;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Title", `<strong>${task.title}</strong>`)}
        ${detailRow("Type", `${icon} ${typeLabel}`)}
        ${detailRow("Project", task.project?.name || "—")}
        ${detailRow("Previous Status", statusBadge(oldStatus))}
        ${detailRow("New Status", statusBadge(newStatus))}
        ${detailRow("Priority", priorityBadge(task.priority))}
        ${detailRow("Updated By", updater?.username || "—", true)}
      </table>
    </div>`;

  const creator   = task.createdBy;
  const assignee  = task.assignedTo;
  const creatorId = creator?._id?.toString()  || creator?.toString()  || "";
  const assigneeId= assignee?._id?.toString() || assignee?.toString() || "";
  const updaterId = updater?._id?.toString()  || updater?.toString()  || "";

  // ── a) Email to CREATOR (if different from updater) ─────────────────
  if (creator?.email && creatorId !== updaterId) {
    const bodyHtml = `
      <p style="font-size:16px;color:#111827;margin:0 0 6px;">Hello <strong>${creator.username || creator.email}</strong>,</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">
        The ${typeLabel.toLowerCase()} you created has been updated by
        <strong style="color:#111827;">${updater?.username || "a team member"}</strong>.
      </p>
      ${sharedDetails}
      <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:12px 16px;">
        <p style="margin:0;font-size:13px;color:#166534;">Your team is making progress! Open the dashboard to see the full ${typeLabel.toLowerCase()} history.</p>
      </div>`;

    const html = emailWrapper({ headerColor, headerLabel: `${typeLabel} Status Updated`, bodyHtml, ctaUrl: appUrl, ctaText: `View ${typeLabel}` });
    try {
      await transporter.sendMail({
        from: `"Task Manager" <${process.env.EMAIL_USER}>`,
        to: creator.email,
        subject: `📢 ${typeLabel} Update: "${task.title}" → ${newStatus}`,
        html,
      });
      console.log(`✅ Status update (creator) → ${creator.email}`);
    } catch (err) {
      console.error("❌ Status update (creator) failed:", err.message);
    }
  }

  // ── b) Email to ASSIGNEE ─────────────────────────────────────────────
  if (assignee?.email) {
    let bodyHtml;
    if (assigneeId === updaterId) {
      // Assignee updated their own task — send a self-confirmation
      bodyHtml = `
        <p style="font-size:16px;color:#111827;margin:0 0 6px;">Hello <strong>${assignee.username || assignee.email}</strong>,</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">
          You have successfully updated the status of your ${typeLabel.toLowerCase()}.
          ${creatorId !== assigneeId ? "The task creator has been notified." : ""}
        </p>
        ${sharedDetails}
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:4px;padding:12px 16px;">
          <p style="margin:0;font-size:13px;color:#166534;">Great work! Keep your team updated by logging further progress in the dashboard.</p>
        </div>`;
    } else {
      // Someone else changed the task assigned to this person
      bodyHtml = `
        <p style="font-size:16px;color:#111827;margin:0 0 6px;">Hello <strong>${assignee.username || assignee.email}</strong>,</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 4px;">
          The status of a ${typeLabel.toLowerCase()} assigned to you has been changed by
          <strong style="color:#111827;">${updater?.username || "a team member"}</strong>.
        </p>
        ${sharedDetails}
        <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:4px;padding:12px 16px;">
          <p style="margin:0;font-size:13px;color:#1e40af;">Please check the dashboard for any additional instructions or comments.</p>
        </div>`;
    }

    const subjectPrefix = assigneeId === updaterId ? "✔️" : "🔔";
    const subjectText   = assigneeId === updaterId
      ? `${typeLabel} Updated: "${task.title}" → ${newStatus}`
      : `Your ${typeLabel} Status Changed: "${task.title}" → ${newStatus}`;

    const html = emailWrapper({ headerColor, headerLabel: `${typeLabel} Status Updated`, bodyHtml, ctaUrl: appUrl, ctaText: `View ${typeLabel}` });
    try {
      await transporter.sendMail({
        from: `"Task Manager" <${process.env.EMAIL_USER}>`,
        to: assignee.email,
        subject: `${subjectPrefix} ${subjectText}`,
        html,
      });
      console.log(`✅ Status update (assignee) → ${assignee.email}`);
    } catch (err) {
      console.error("❌ Status update (assignee) failed:", err.message);
    }
  }
};

/* ─────────────────────────────────────────
   4. DOCUMENT ASSIGNED EMAIL
      Sent when a document is created/updated and a user is given access.
───────────────────────────────────────── */
exports.sendDocumentAssignedEmail = async ({ toUser, document, sharedBy, appLink, isUpdate = false }) => {
  if (!toUser?.email) return;

  const headerColor = "#2b579a";
  const label       = isUpdate ? "Document Access Updated" : "Document Shared With You";
  const icon        = "📄";
  const docUrl      = appLink || `${process.env.FRONTEND_URL}/documents`;
  const isEditor    = document.fileType === "docs" || document.isEditorGenerated;
  const projectName = document.project?.name || "—";
  const companyName = document.company?.name  || "—";

  const bodyHtml = `
    <p style="font-size:16px;color:#111827;margin:0 0 6px;">Hello <strong>${toUser.username || toUser.email}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
      <strong style="color:#111827;">${sharedBy?.username || sharedBy || "A team member"}</strong>
      has ${isUpdate ? "updated your access to" : "granted you access to"} a document.
      You can now ${isEditor ? "view and collaborate on" : "view and download"} it.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        ${detailRow("Document", `<strong>${document.title}</strong>`)}
        ${detailRow("Type", isEditor ? `${icon} Internal Editor Document` : `${icon} Uploaded File (${document.fileType || "file"})`)}
        ${detailRow("Project", projectName)}
        ${companyName !== "—" ? detailRow("Company", companyName) : ""}
        ${detailRow("Shared By", sharedBy?.username || sharedBy || "—")}
        ${document.description ? detailRow("Description", document.description, true) : ""}
      </table>
    </div>
    <div style="background:#eff6ff;border-left:4px solid #2b579a;border-radius:4px;padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#1e3a5f;">
        <strong>💡 Next Step:</strong> ${isEditor ? "Open the document in the editor to read or collaborate in real time." : "Download or preview the document from your project dashboard."}
      </p>
    </div>`;

  const html = emailWrapper({ headerColor, headerLabel: label, bodyHtml, ctaUrl: docUrl, ctaText: isEditor ? "Open in Editor" : "View Document" });

  try {
    await transporter.sendMail({
      from: `"Task Manager" <${process.env.EMAIL_USER}>`,
      to: toUser.email,
      subject: `${icon} Document ${isUpdate ? "Access Updated" : "Shared"}: "${document.title}"`,
      html,
    });
    console.log(`✅ Document email → ${toUser.email}`);
  } catch (err) {
    console.error("❌ Document email failed:", err.message);
  }
};