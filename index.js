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

const authRoutes = require("./routes/authRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const taskRoutes = require("./routes/taskRoutes");
const roleRoutes = require("./routes/roleRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userRoutes = require("./routes/userRoutes");
const taskStatusRoutes = require("./routes/taskStatusRoutes");
const projectRoutes = require("./routes/projectRoutes");


const app = express();

/* ================= CORS CONFIG ================= */

/* ================= CORS CONFIG ================= */

const allowedOrigins = [
  "http://localhost:5173",
  "https://gn4mfrgh-5173.inc1.devtunnels.ms",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/* ================= GLOBAL MIDDLEWARE ================= */

app.use(express.json());
app.use(cookieParser());

/* ================= DATABASE ================= */

connectDB()
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await createAdmin();
  })
  .catch((err) => {
    console.error("❌ DB Error:", err.message);
  });

/* ================= CREATE ADMIN ================= */

const createAdmin = async () => {
  try {
    let adminRole = await Role.findOne({ name: "ADMIN" });

    if (!adminRole) {
      adminRole = await Role.create({
        name: "ADMIN",
        permissions: [],
        status: 1,
      });
    }

    let staffRole = await Role.findOne({ name: "STAFF" });

    if (!staffRole) {
      await Role.create({
        name: "STAFF",
        permissions: [],
        status: 1,
      });
    }

    const adminExists = await User.findOne({
      email: "admin@gmail.com",
    });

    if (adminExists) return;

    const hashedPassword = await bcrypt.hash("123456", 10);

    await User.create({
      username: "Yuvraj",
      email: "admin@gmail.com",
      password: hashedPassword,
      role: adminRole._id,
      isActive: true,
    });

    console.log("🚀 Admin created");
  } catch (error) {
    console.error(error.message);
  }
};

/* ================= ROUTES ================= */

app.use("/api/auth", authRoutes);
app.use("/api/permissions", permissionRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/task-status", taskStatusRoutes);
app.use("/uploads", express.static("uploads"));
app.use("/api/projects", projectRoutes);


/* ================= SOCKET SERVER ================= */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("🔥 Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected");
  });
});

app.set("io", io);

/* ================= SERVER ================= */

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});