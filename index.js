require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const User = require("./models/User");
const Role = require("./models/Role");
const Document = require("./models/Document"); // ✅ Added for collection creation

// Routes
const authRoutes = require("./routes/authRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const taskRoutes = require("./routes/taskRoutes");
const roleRoutes = require("./routes/roleRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userRoutes = require("./routes/userRoutes");
const taskStatusRoutes = require("./routes/taskStatusRoutes");
const projectRoutes = require("./routes/projectRoutes");
const documentRoutes = require("./routes/documentRoutes");

const app = express();

/* ================= CORS CONFIG ================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://gn4mfrgh-5173.inc1.devtunnels.ms",
  "https://gn4mfrgh-4000.inc1.devtunnels.ms",
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  // handle preflight request
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* ================= GLOBAL MIDDLEWARE ================= */
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads")); // serve uploaded files

/* ================= DATABASE ================= */
connectDB()
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await createAdmin();
    await createTestDocument(); // ✅ Optional: create a test document to ensure collection exists
  })
  .catch((err) => {
    console.error("❌ DB Error:", err.message);
  });

/* ================= CREATE DEFAULT ADMIN ================= */
const createAdmin = async () => {
  try {
    let adminRole = await Role.findOne({ name: "ADMIN" });
    if (!adminRole) {
      adminRole = await Role.create({ name: "ADMIN", permissions: [], status: 1 });
      console.log("✅ ADMIN role created");
    }

    let staffRole = await Role.findOne({ name: "STAFF" });
    if (!staffRole) {
      await Role.create({ name: "STAFF", permissions: [], status: 1 });
      console.log("✅ STAFF role created");
    }

    const adminExists = await User.findOne({ email: "admin@gmail.com" });
    if (adminExists) return;

    const hashedPassword = await bcrypt.hash("123456", 10);
    await User.create({
      username: "Yuvraj",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: adminRole._id,
      isActive: true,
    });

    console.log("🚀 Default admin created");
  } catch (err) {
    console.error("Admin creation error:", err.message);
  }
};

/* ================= CREATE TEST DOCUMENT (OPTIONAL) ================= */
const createTestDocument = async () => {
  try {
    const admin = await User.findOne({ email: "admin@gmail.com" });
    if (!admin) return;

    const existingDoc = await Document.findOne({ title: "Test Document" });
    if (!existingDoc) {
      await Document.create({
        title: "Test Document",
        description: "Auto-created document for testing",
        project: new require("mongoose").Types.ObjectId(),
        uploadedBy: admin._id,
        accessType: "public",
        allowedUsers: [],
        fileUrl: "uploads/documents/test.pdf",
        originalName: "test.pdf",
        fileType: "PDF",
      });
      console.log("✅ Test document created (collection now exists)");
    }
  } catch (err) {
    console.error("Test document creation error:", err.message);
  }
};

/* ================= API ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/task-status", taskStatusRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/documents", documentRoutes);


/* ================= SOCKET.IO ================= */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("🔥 Socket connected:", socket.id);
  // Allow clients to join rooms by user id or generic id (used across the app)
  socket.on("joinUser", (id) => {
    try {
      if (id) {
        socket.join(`user_${id}`);
        console.log(`User ${id} joined room user_${id}`);
      }
    } catch (err) {
      console.error("joinUser error:", err.message);
    }
  });

  socket.on("join", (id) => {
    try {
      if (id) socket.join(String(id));
      console.log(`Socket joined room: ${id}`);
    } catch (err) {
      console.error("join error:", err.message);
    }
  });

  // Join project-based room for real-time document updates
  socket.on("joinProject", (projectId) => {
    try {
      if (projectId) {
        socket.join(`project_${projectId}`);
        console.log(`Socket joined project room: project_${projectId}`);
      }
    } catch (err) {
      console.error("joinProject error:", err.message);
    }
  });

  // Leave project room when switching projects
  socket.on("leaveProject", (projectId) => {
    try {
      if (projectId) {
        socket.leave(`project_${projectId}`);
        console.log(`Socket left project room: project_${projectId}`);
      }
    } catch (err) {
      console.error("leaveProject error:", err.message);
    }
  });

  // Join organization-based room for real-time staff/project updates
  socket.on("joinOrganization", (orgId) => {
    try {
      if (orgId) {
        socket.join(`org_${orgId}`);
        console.log(`Socket joined org room: org_${orgId}`);
      }
    } catch (err) {
      console.error("joinOrganization error:", err.message);
    }
  });

  // Leave organization room
  socket.on("leaveOrganization", (orgId) => {
    try {
      if (orgId) {
        socket.leave(`org_${orgId}`);
        console.log(`Socket left org room: org_${orgId}`);
      }
    } catch (err) {
      console.error("leaveOrganization error:", err.message);
    }
  });

  socket.on("disconnect", () => console.log("❌ Socket disconnected"));
});

app.set("io", io);

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));