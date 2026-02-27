const Document = require("../models/Document");
const DocumentRequest = require("../models/DocumentRequest");
const User = require("../models/User");
const sendMail = require("../utils/sendMail");

// GET all documents accessible to the user
const getDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    const docs = await Document.find({
      $or: [{ ownerId: userId }, { allowedUsers: userId }]
    }).populate("ownerId", "username email");
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// GET documents by project
const getProjectDocuments = async (req, res) => {
  try {
    const projectId = req.params.id;

    // only return documents that belong to this project
    const docs = await Document.find({ projectId })
      .populate("ownerId", "username email")
      .populate("allowedUsers", "username email");

    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// UPLOAD document
const uploadDocument = async (req, res) => {
  try {
    const { projectId, allowedUsers } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ msg: "File required" });

    const doc = await Document.create({
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      projectId,
      ownerId: req.user.id,
      allowedUsers: JSON.parse(allowedUsers)
    });

    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// REQUEST access to document
const requestAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) return res.status(404).json({ msg: "Document not found" });

    const existingRequest = await DocumentRequest.findOne({
      documentId: id,
      requesterId: req.user.id
    });
    if (existingRequest) return res.status(400).json({ msg: "Request already sent" });

    await DocumentRequest.create({
      documentId: id,
      requesterId: req.user.id
    });

    const owner = await User.findById(doc.ownerId);
    const requester = await User.findById(req.user.id);

    await sendMail({
      to: owner.email,
      subject: `Access Request for Document: ${doc.name}`,
      html: `<p><strong>${requester.username}</strong> has requested access to your document <strong>${doc.name}</strong>.</p>`
    });

    res.json({ msg: "Request sent to document owner" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = { getDocuments, getProjectDocuments, uploadDocument, requestAccess };