const Document = require("../models/Document");
const User = require("../models/User");
const Role = require("../models/Role");
const nodemailer = require("nodemailer");

const BASE_URL = process.env.BASE_URL || "http://localhost:4000";

/* ================= SEND EMAIL ================= */
const sendDocumentEmail = async (toEmail, documentTitle, uploader, fileUrl) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const downloadUrl = `${BASE_URL}/api/documents/download/${fileUrl}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: `📄 New Document Shared: ${documentTitle}`,
      html: `
        <div style="font-family: Arial; padding: 20px; background-color: #f9f9f9;">
          <h2 style="color: #333;">📄 New Document Shared With You</h2>
          
          <p style="color: #666; font-size: 16px;">
            <strong>${uploader}</strong> has shared a document with you.
          </p>

          <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Document:</strong> ${documentTitle}</p>
            <p><strong>Uploaded by:</strong> ${uploader}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>

          <p style="margin: 20px 0;">
            <a href="${downloadUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              📥 View Document
            </a>
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `,
    });

    console.log(`✅ Document email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to send document email:", error.message);
    return false;
  }
};

/* ================= GET DOCUMENTS ================= */

exports.getDocuments = async (req, res) => {
  try {
    const { project } = req.query;

    const docs = await Document.find({ project })
      .populate("uploadedBy", "name email")
      .populate("allowedUsers", "name email")
      .populate("accessRequests.user", "name email");

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
          await sendDocumentEmail(
            user.email,
            title,
            req.user.username || req.user.email,
            req.file.filename
          );
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

    if (doc.uploadedBy.toString() !== req.user._id.toString()) {
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

exports.requestAccess = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }

    // already allowed
    if (doc.allowedUsers.includes(req.user._id)) {
      return res.status(400).json({ message: "Already allowed" });
    }

    const exists = doc.accessRequests.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (exists) {
      return res.status(400).json({ message: "Already requested" });
    }

    doc.accessRequests.push({
      user: req.user._id,
      status: "pending",
    });

    await doc.save();

    // Emit socket notification to document owner and admins
    try {
      const io = req.app.get("io");

      const payload = {
        type: "document_request",
        documentId: doc._id,
        documentTitle: doc.title,
        requester: {
          id: req.user._id,
          name: req.user.name || req.user.username || req.user.email,
          email: req.user.email,
        },
      };

      if (io) {
        // notify owner
        if (doc.uploadedBy) {
          io.to(String(doc.uploadedBy)).emit("documentRequest", payload);
        }

        // notify admins
        const adminRole = await Role.findOne({ name: "ADMIN" });
        if (adminRole) {
          const admins = await User.find({ role: adminRole._id });
          admins.forEach((a) => {
            if (a && a._id) io.to(String(a._id)).emit("documentRequest", payload);
          });
        }
      }
    } catch (e) {
      console.error("Socket notify error:", e.message);
    }

    res.json({ message: "Request sent" });
  } catch {
    res.status(500).json({ message: "Request failed" });
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
    if (doc.uploadedBy.toString() !== req.user._id.toString()) {
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
    const documents = await Document.find({ project: projectId })
      .populate("uploadedBy", "name email username")
      .populate("accessRequests.user", "name email username");

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
          requesterName: requesterName,
          requesterEmail: requesterEmail,
          projectId: doc.project,
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