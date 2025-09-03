const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// Import routes
const adminRoutes = require("./src/routes/admin.routes");
app.use("/admin", adminRoutes);

const authRoutes = require("./src/routes/auth.routes");
app.use("/auth", authRoutes);

const studentRoutes = require("./src/routes/student.routes");
app.use("/", studentRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

