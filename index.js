require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const User = require("./models/User");
const Role = require("./models/Role");
const Document     = require("./models/Document");
const DocumentPage = require("./models/DocumentPage");
const Company            = require("./models/Company");
const DeletedCompanyLog  = require("./models/DeletedCompanyLog");
const ChatRoom    = require("./models/ChatRoom");
const ChatMessage = require("./models/ChatMessage");
const TimeLog     = require("./models/TimeLog");

// Routes
const chatRoutes         = require("./routes/chatRoutes");
const authRoutes         = require("./routes/authRoutes");
const permissionRoutes   = require("./routes/permissionRoutes");
const taskRoutes         = require("./routes/taskRoutes");
const roleRoutes         = require("./routes/roleRoutes");
const dashboardRoutes    = require("./routes/dashboardRoutes");
const userRoutes         = require("./routes/userRoutes");
const taskStatusRoutes   = require("./routes/taskStatusRoutes");
const projectRoutes      = require("./routes/projectRoutes");
const documentRoutes     = require("./routes/documentRoutes");
const companyRoutes      = require("./routes/companyRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const calendarRoutes     = require("./routes/calendarRoutes");
const timeLogRoutes      = require("./routes/timeLogRoutes");
const aiTaskRoutes       = require("./routes/aiTaskRoutes"); // FIX: was never imported

const app = express();

/* ================= CORS CONFIG ================= */
// FIX: Dynamic origin checker instead of hardcoded array.
// Devtunnel subdomains change frequently; static lists get stale fast.
const STATIC_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
].filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true; // allow non-browser requests (curl, Postman)
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow any VS Code devtunnel origin (inc1, inc2, etc.)
  if (/^https:\/\/[a-z0-9]+-\d+\.inc\d+\.devtunnels\.ms$/.test(origin)) return true;
  // Allow Render deployments
  if (/\.onrender\.com$/.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cookie",
  ],
};

// FIX: Respond to OPTIONS preflight BEFORE all other middleware.
// Without this line, preflight gets no CORS headers and the browser blocks it.
app.options(/.*/, cors(corsOptions));
app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (req.headers["access-control-request-private-network"]) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
});

/* ================= GLOBAL MIDDLEWARE ================= */
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));

/* ================= DATABASE & INIT ================= */
connectDB()
  .then(async () => {
    console.log("MongoDB Connected");
    try {
      await createAdmin();
      await createTestDocument();
    } catch (err) {
      console.error("Initialization Error:", err.message);
    }
  })
  .catch((err) => {
    console.error("DB Error:", err.message);
    process.exit(1);
  });

/* ================= INITIALIZATION HELPERS ================= */
const createAdmin = async () => {
  const adminRole = await Role.findOneAndUpdate(
    { name: "ADMIN" },
    { name: "ADMIN", status: 1 },
    { upsert: true, new: true }
  );

  await Role.findOneAndUpdate(
    { name: "STAFF" },
    { name: "STAFF", status: 1 },
    { upsert: true }
  );

  const adminExists = await User.findOne({ email: "admin@gmail.com" });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("123456", 10);
    await User.create({
      username: "Yuvraj",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: adminRole._id,
      isActive: true,
    });
    console.log("Default admin created");
  }
};

const createTestDocument = async () => {
  const admin = await User.findOne({ email: "admin@gmail.com" });
  if (!admin) return;

  const existingDoc = await Document.findOne({ title: "Test Document" });
  if (!existingDoc) {
    await Document.create({
      title: "Test Document",
      description: "Auto-created",
      project: new mongoose.Types.ObjectId(),
      uploadedBy: admin._id,
      accessType: "public",
      fileUrl: "uploads/documents/test.pdf",
      originalName: "test.pdf",
      fileType: "PDF",
    });
  }
};

/* ================= API ROUTES ================= */
app.use("/api/auth",          authRoutes);
app.use("/api/permissions",   permissionRoutes);
app.use("/api/tasks",         taskRoutes);
app.use("/api/tasks",         aiTaskRoutes); // FIX: AI routes were never registered
app.use("/api/roles",         roleRoutes);
app.use("/api/dashboard",     dashboardRoutes);
app.use("/api/users",         userRoutes);
app.use("/api/task-status",   taskStatusRoutes);
app.use("/api/projects",      projectRoutes);
app.use("/api/documents",     documentRoutes);
app.use("/api/company",       companyRoutes);
app.use("/api/chat",          chatRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/calendar",      calendarRoutes);
app.use("/api/timelogs",      timeLogRoutes);

/* ================= SOCKET.IO ================= */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // FIX: Same dynamic origin checker for Socket.IO CORS
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Socket.IO: Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  // FIX: Start with polling so the connection succeeds even if WebSocket
  // upgrade fails (common behind proxies/devtunnels), then upgrades automatically.
  transports: ["polling", "websocket"],
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("joinUser", (id) => {
    if (id) socket.join(`user_${id}`);
  });

  socket.on("join", (id) => {
    if (id) socket.join(String(id));
  });

  socket.on("joinProject", (projectId) => {
    if (projectId) socket.join(`project_${projectId}`);
  });

  socket.on("joinCompany", (companyId) => {
    if (companyId) socket.join(`company_${companyId}`);
  });

  socket.on("joinChatRoom", (roomId) => {
    if (roomId) {
      socket.join(`chat_${roomId}`);
      console.log(`Socket joined chat room: chat_${roomId}`);
    }
  });

  socket.on("leaveChatRoom", (roomId) => {
    if (roomId) {
      socket.leave(`chat_${roomId}`);
    }
  });

  socket.on("chatTyping", ({ roomId, userId, username }) => {
    if (roomId && userId) {
      socket.to(`chat_${roomId}`).emit("userTyping", { userId, username, roomId });
    }
  });

  socket.on("chatStopTyping", ({ roomId, userId }) => {
    if (roomId && userId) {
      socket.to(`chat_${roomId}`).emit("userStopTyping", { userId, roomId });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

app.set("io", io);

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});