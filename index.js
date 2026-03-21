require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose"); // Added for general utility

const connectDB = require("./config/db");
const User = require("./models/User");
const Role = require("./models/Role");
const Document = require("./models/Document");
const Company = require("./models/Company"); // 1. Import your new model

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
const companyRoutes = require("./routes/companyRoutes"); // 2. Import Company Routes

const app = express();

/* ================= CORS CONFIG ================= */
const allowedOrigins = [
  "http://localhost:5173",
  "https://gn4mfrgh-5173.inc1.devtunnels.ms",
  "https://gn4mfrgh-4000.inc1.devtunnels.ms",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"]
}));

/* ================= GLOBAL MIDDLEWARE ================= */
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static("uploads"));

/* ================= DATABASE & INIT ================= */
connectDB()
  .then(async () => {
    console.log("✅ MongoDB Connected");
    try {
      await createAdmin();
      await createTestDocument();
      // await seedDefaultCompany(); // Optional: Seed a default company if needed
    } catch (err) {
      console.error("Initialization Error:", err.message);
    }
  })
  .catch((err) => {
    console.error("❌ DB Error:", err.message);
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
    console.log("🚀 Default admin created");
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
app.use("/api/auth", authRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/task-status", taskStatusRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/company", companyRoutes); // 3. Register Company Routes

/* ================= SOCKET.IO ================= */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  pingTimeout: 60000,
});

io.on("connection", (socket) => {
  console.log("🔥 Socket connected:", socket.id);

  socket.on("joinUser", (id) => {
    if (id) socket.join(`user_${id}`);
  });

  socket.on("join", (id) => {
    if (id) socket.join(String(id));
  });

  socket.on("joinProject", (projectId) => {
    if (projectId) socket.join(`project_${projectId}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// Attach socket to app for use in controllers
app.set("io", io);

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});