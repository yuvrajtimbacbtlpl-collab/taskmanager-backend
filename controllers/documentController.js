const Document = require("../models/Document");
const DocumentPage = require("../models/DocumentPage");
const User = require("../models/User");
const Role = require("../models/Role");
const { sendDocumentAssignedEmail } = require("../utils/mailService");  // ✅ IMPROVED mail
const nodemailer = require("nodemailer"); // kept for access-request notification

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

/* ================= SEND EMAIL (wrapper kept for backward compat) ================= */
// This now delegates to the professional template in mailService
const sendDocumentEmail = async (toEmail, documentTitle, uploader, fileUrl, docObject) => {
  try {
    const userObj = { email: toEmail, username: null };
    const docInfo = docObject || { title: documentTitle, fileType: fileUrl === "view-in-dashboard" ? "docs" : "file", isEditorGenerated: fileUrl === "view-in-dashboard" };
    const appLink = fileUrl === "view-in-dashboard"
      ? `${(process.env.FRONTEND_URL || BASE_URL).replace("/api", "")}/dashboard/documents`
      : `${BASE_URL}/api/documents/download/${fileUrl}`;
    await sendDocumentAssignedEmail({ toUser: userObj, document: docInfo, sharedBy: uploader, appLink });
    return true;
  } catch (error) {
    console.error("❌ Email failed:", error.message);
    return false;
  }
};

/* ================= GET DOCUMENTS ================= */

exports.getDocuments = async (req, res) => {
  try {
    const { project, company } = req.query;

    let query = {};

    // ✅ FIX: Support company parameter for global scope
    if (project) query.project = project;

    // If company is provided and not "global", filter by company
    if (company && company !== "global") {
      query.company = company;
    }

    const docs = await Document.find({ project })
      // FIX: Added 'username' to population so the frontend can see it
      .populate("uploadedBy", "name email username")
      .populate("allowedUsers", "name email username")
      .populate("accessRequests.user", "name email username");

    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch documents" });
  }
};

/* ================= CREATE DOCUMENT ================= */

exports.createDocument = async (req, res) => {
  try {
    const { title, description, project } = req.body;

    const selectedUsers = JSON.parse(req.body.allowedUsers || "[]");

    const allowedUsers = [req.user._id, ...selectedUsers];

    const doc = await Document.create({
      title,
      description,
      project,
      fileUrl: req.file.filename,
      fileType: req.file.mimetype,
      uploadedBy: req.user._id,
      allowedUsers: allowedUsers,
      accessRequests: selectedUsers.map((userId) => ({
        user: userId,
        status: "approved",
      })),
    });

    // Populate uploadedBy before sending response
    await doc.populate("uploadedBy", "name email username");
    await doc.populate("allowedUsers", "email username");

    /* ===== SEND EMAILS TO ALLOWED USERS ===== */
    try {
      for (const userId of selectedUsers) {
        const user = await User.findById(userId);
        if (user?.email) {
          await sendDocumentAssignedEmail({
            toUser: user,
            document: doc,
            sharedBy: req.user,
            appLink: `${(process.env.FRONTEND_URL || BASE_URL).replace("/api", "")}/dashboard/documents`,
          });
        }
      }
    } catch (emailError) {
      console.error("Email sending error:", emailError.message);
      // Don't fail the upload if email fails
    }

    // Emit socket notification to all users in the project
    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`project_${project}`).emit("documentUploaded", {
          type: "document_uploaded",
          document: {
            _id: doc._id,
            title: doc.title,
            description: doc.description,
            fileUrl: doc.fileUrl,
            fileType: doc.fileType,
            uploadedBy: doc.uploadedBy,
            allowedUsers: doc.allowedUsers,
            createdAt: doc.createdAt,
          },
        });
        console.log("✅ documentUploaded emitted to project room");
      }
    } catch (e) {
      console.error("Socket notify error:", e.message);
    }

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Upload failed" });
  }
};

/* ================= DELETE DOCUMENT ================= */

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";
    // ✅ SUPER ADMIN can delete any document. Others can only delete their own.
    if (!isAdmin && doc.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const projectId = doc.project;
    await doc.deleteOne();

    // Emit socket notification to all users in the project
    try {
      const io = req.app.get("io");
      if (io) {
        io.to(`project_${projectId}`).emit("documentDeleted", {
          type: "document_deleted",
          documentId: doc._id,
          documentTitle: doc.title,
        });
      }
    } catch (e) {
      console.error("Socket notify error:", e.message);
    }

    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
};

/* ================= REQUEST ACCESS ================= */
/* ================= REQUEST ACCESS ================= */
exports.requestAccess = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Check if already requested
    const alreadyRequested = doc.accessRequests.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyRequested) {
      return res.status(400).json({ message: "Request already sent" });
    }

    doc.accessRequests.push({
      user: req.user._id,
      status: "pending",
    });

    await doc.save();

    /* ===== SOCKET NOTIFICATION ===== */
    try {
      const io = req.app.get("io");

      if (io) {
        const ownerId = doc.uploadedBy.toString();

        io.to(`user_${ownerId}`).emit("documentAccessRequested", {
          type: "document_access_requested",
          documentId: doc._id,
          documentTitle: doc.title,
          requesterId: req.user._id,
          requesterName: req.user.username || req.user.email,
          requesterEmail: req.user.email,
          status: "pending",
        });

        console.log("✅ documentAccessRequested emitted");
      }
    } catch (e) {
      console.error("Socket notify error:", e.message);
    }

    res.json({ message: "Request sent" });

  } catch (err) {
    res.status(500).json({ message: "Error requesting access" });
  }
};

/* ================= GET REQUESTS ================= */

exports.getRequests = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id).populate(
      "accessRequests.user",
      "name email"
    );

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.json(doc.accessRequests);
  } catch {
    res.status(500).json({ message: "Failed to load requests" });
  }
};

/* ================= UPDATE REQUEST ================= */

exports.updateRequest = async (req, res) => {
  try {
    const { status } = req.body;
    const { id, userId } = req.params;

    const doc = await Document.findById(id);

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // only owner can approve
    const isAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";
    // ✅ SUPER ADMIN can delete any document. Others can only delete their own.
    if (!isAdmin && doc.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const request = doc.accessRequests.find(
      (r) => r.user.toString() === userId
    );

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    request.status = status;

    // add to allowed users if approved
    if (status === "approved") {
      const exists = doc.allowedUsers.find(
        (u) => u.toString() === userId.toString()
      );

      if (!exists) {
        doc.allowedUsers.push(userId);
      }
    }

    await doc.save();

    // Emit socket notifications
    try {
      const io = req.app.get("io");
      if (io) {
        // Notify the requester about status change
        io.to(String(request.user)).emit("documentRequestStatusChanged", {
          type: "document_request_" + status,
          documentId: doc._id,
          documentTitle: doc.title,
          status: status,
        });

        // Notify all project users about permission update so they can refresh
        io.to(`project_${doc.project}`).emit("documentPermissionsUpdated", {
          type: "document_permissions_updated",
          documentId: doc._id,
          documentTitle: doc.title,
          userId: userId,
          status: status,
        });
      }
    } catch (e) {
      console.error("Socket notify error:", e.message);
    }

    res.json({ message: "Request updated" });
  } catch {
    res.status(500).json({ message: "Action failed" });
  }
};

/* ================= GET PENDING DOCUMENT REQUESTS FOR PROJECT ================= */

exports.getPendingRequests = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user._id;

    // Find all documents in the project where current user is the owner
    const documents = await Document.find({ project: req.query.project })
      .populate("uploadedBy", "_id username email")
      .populate("allowedUsers", "_id username email")
      .populate("accessRequests.user", "_id username email")
      .sort({ createdAt: -1 });

    // Filter for pending requests where current user is the owner
    const pendingRequests = [];

    for (const doc of documents) {
      // Only show requests for documents uploaded by the current user
      if (doc.uploadedBy._id.toString() === userId.toString()) {
        const pending = doc.accessRequests.filter(
          (req) => req.status === "pending"
        );

        for (const request of pending) {
          pendingRequests.push({
            documentId: doc._id,
            documentTitle: doc.title,
            documentDescription: doc.description,
            requesterId: request.user._id,
            requesterName: request.user.name,
            requesterEmail: request.user.email,
            requesterUsername: request.user.username,
            requestStatus: request.status,
            createdAt: doc.createdAt,
          });
        }
      }
    }

    res.json({
      count: pendingRequests.length,
      requests: pendingRequests,
    });
  } catch (err) {
    console.error("Error fetching pending requests:", err);
    res.status(500).json({ message: "Failed to fetch pending requests" });
  }
};

/* ================= REQUEST DOCUMENT ACCESS (WITH EMAIL) ================= */

exports.requestDocumentAccess = async (req, res) => {
  try {
    const { documentId } = req.params;
    const requesterId = req.user._id;
    const requesterEmail = req.user.email;
    const requesterName = req.user.username || req.user.name;

    const doc = await Document.findById(documentId)
      .populate("uploadedBy", "name email username");

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Check if already requested or already has access
    const existingRequest = doc.accessRequests.find(
      (r) => r.user.toString() === requesterId.toString()
    );

    if (existingRequest && existingRequest.status === "pending") {
      return res.status(400).json({ message: "Request already pending" });
    }

    if (
      doc.allowedUsers.find((u) => u.toString() === requesterId.toString())
    ) {
      return res.status(400).json({ message: "Already have access" });
    }

    // Add new request
    doc.accessRequests.push({
      user: requesterId,
      status: "pending",
    });

    await doc.save();

    /* ===== SEND EMAIL TO DOCUMENT OWNER ===== */
    try {
      const ownerEmail = doc.uploadedBy.email;
      const ownerName = doc.uploadedBy.username || doc.uploadedBy.name;

      if (ownerEmail) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

        const dashboardUrl = `${BASE_URL}/dashboard`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: ownerEmail,
          subject: `📋 New Access Request: ${doc.title}`,
          html: `
            <div style="font-family: Arial; padding: 20px; background-color: #f9f9f9;">
              <h2 style="color: #333;">📋 New Access Request for Document</h2>
              
              <p style="color: #666; font-size: 16px;">
                <strong>${requesterName}</strong> (${requesterEmail}) has requested access to your document.
              </p>

              <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ff9800;">
                <p><strong>Document:</strong> ${doc.title}</p>
                <p><strong>Description:</strong> ${doc.description || "No description"}</p>
                <p><strong>Requested by:</strong> ${requesterName}</p>
                <p><strong>Email:</strong> ${requesterEmail}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>

              <p style="margin: 20px 0;">
                <a href="${dashboardUrl}" style="background-color: #ff9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  ✅ Review Request in Dashboard
                </a>
              </p>

              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                <strong>Quick Actions:</strong><br>
                You will see a notification popup when you next login to the dashboard showing all pending requests for this project.
              </p>

              <p style="color: #999; font-size: 12px; margin-top: 30px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          `,
        });

        console.log(`✅ Access request email sent to ${ownerEmail}`);
      }
    } catch (emailError) {
      console.error("❌ Failed to send access request email:", emailError.message);
      // Don't fail the request if email fails
    }

    /* ===== EMIT SOCKET NOTIFICATION ===== */
    try {
      const io = req.app.get("io");
      if (io) {
        // Notify the owner via their user room
        const ownerUserId = doc.uploadedBy._id.toString();
        io.to(`user_${ownerUserId}`).emit("documentAccessRequested", {
          type: "document_access_requested",
          documentId: doc._id,
          documentTitle: doc.title,
          requesterId: requesterId,   // ⭐ ADD
          requesterName: requesterName,
          requesterEmail: requesterEmail,
          projectId: doc.project,
          status: "pending"
        });
        console.log(`✅ documentAccessRequested emitted to user_${ownerUserId}`);
      }
    } catch (e) {
      console.error("Socket notify error:", e.message);
    }

    res.json({ message: "Request sent successfully" });
  } catch (err) {
    console.error("Error requesting access:", err);
    res.status(500).json({ message: "Failed to request access" });
  }
};



exports.createInternalDocument = async (req, res) => {
  try {
    const { title, description, project, allowedUsers, pages, pageSize, fileType, company } = req.body;
    const documentId = req.params.id;

    // ✅ Parse pages from frontend: [{ pageNumber, content }, ...]
    const parsePagesPayload = (pagesData) => {
      if (pagesData) {
        const parsed = typeof pagesData === "string" ? JSON.parse(pagesData) : pagesData;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return [{ pageNumber: 1, content: "" }];
    };

    const pagesPayload = parsePagesPayload(pages);

    // ── UPDATE existing document ────────────────────────────────────────
    if (documentId) {
      const doc = await Document.findById(documentId);
      if (!doc) return res.status(404).json({ message: "Not found" });
      const isDocAdmin = (req.user.role?.name || req.user.role || "").toUpperCase() === "ADMIN";
      // ✅ SUPER ADMIN can edit any document. Others can only edit their own.
      if (!isDocAdmin && doc.uploadedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Only owner can edit" });
      }

      if (title) doc.title = title;
      if (pageSize) doc.pageSize = pageSize;
      if (description !== undefined) doc.description = description;

      doc.pageCount = pagesPayload.length;

      // ✅ Upsert each page: update if exists, create if new, delete removed
      const existingPages = await DocumentPage.find({ documentId: doc._id });
      const existingNums = existingPages.map((p) => p.pageNumber);
      const newNums = pagesPayload.map((p) => p.pageNumber);

      // Delete pages that were removed
      const toDelete = existingNums.filter((n) => !newNums.includes(n));
      if (toDelete.length > 0) {
        await DocumentPage.deleteMany({ documentId: doc._id, pageNumber: { $in: toDelete } });
      }

      // Upsert each page
      for (const page of pagesPayload) {
        await DocumentPage.findOneAndUpdate(
          { documentId: doc._id, pageNumber: page.pageNumber },
          { content: page.content || "" },
          { upsert: true, new: true }
        );
      }

      // Handle permission updates
      if (allowedUsers) {
        const oldUsers = doc.allowedUsers.map((id) => id.toString());
        const newUsers = [req.user._id.toString(), ...allowedUsers];
        const newlyAdded = allowedUsers.filter((id) => !oldUsers.includes(id.toString()));
        doc.allowedUsers = newUsers;
        for (const userId of newlyAdded) {
          const userObj = await User.findById(userId);
          if (userObj?.email) {
            await sendDocumentAssignedEmail({
              toUser: userObj,
              document: doc,
              sharedBy: req.user,
              appLink: `${(process.env.FRONTEND_URL || BASE_URL).replace("/api", "")}/dashboard/documents`,
              isUpdate: true,
            });
          }
        }
      }

      await doc.save();
      return res.json({ ...doc.toObject(), pageCount: doc.pageCount });
    }

    // ── CREATE new document ─────────────────────────────────────────────
    const newDoc = await Document.create({
      title: title || "Untitled Document",
      description: description || "",
      pageSize: pageSize || "A4",
      pageCount: pagesPayload.length,
      project,
      company: company || null,
      fileType: fileType === "txt" ? "txt" : "docs",
      isEditorGenerated: true,
      uploadedBy: req.user._id,
      allowedUsers: [req.user._id, ...(allowedUsers || [])],
    });

    // ✅ Create a DocumentPage record for each page
    const pageRecords = pagesPayload.map((p) => ({
      documentId: newDoc._id,
      pageNumber: p.pageNumber || 1,
      content: p.content || "",
    }));
    await DocumentPage.insertMany(pageRecords);

    // Send emails — professional template
    if (allowedUsers && allowedUsers.length > 0) {
      for (const userId of allowedUsers) {
        const userObj = await User.findById(userId);
        if (userObj?.email) {
          await sendDocumentAssignedEmail({
            toUser: userObj,
            document: newDoc,
            sharedBy: req.user,
            appLink: `${(process.env.FRONTEND_URL || BASE_URL).replace("/api", "")}/dashboard/documents`,
          });
        }
      }
    }

    res.json(newDoc);
  } catch (err) {
    console.error("❌ createInternalDocument error:", err);
    res.status(500).json({ message: "Save failed" });
  }
};

/* ================= GET PAGES BY DOCUMENT ID ================= */

exports.getDocumentPages = async (req, res) => {
  try {
    const { id } = req.params; // document _id

    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    // ✅ Fetch all pages for this document, ordered by pageNumber
    const pages = await DocumentPage.find({ documentId: id })
      .sort({ pageNumber: 1 })
      .select("pageNumber content _id");

    // If no pages exist yet (old doc), return 1 empty page
    if (pages.length === 0) {
      return res.json([{ pageNumber: 1, content: "" }]);
    }

    res.json(pages);
  } catch (err) {
    console.error("❌ getDocumentPages error:", err);
    res.status(500).json({ message: "Failed to fetch pages" });
  }
};