const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const studentRoutes = require("./routes/student.routes");
//const staffRoutes = require("./routes/staff.routes");
const adminRoutes = require("./routes/admin.routes");
const authRoutes = require("./routes/auth.routes");



dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Mount routes
app.use("/api/student", studentRoutes);
//app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);
//app.use("/appointments", appointmentRoutes);


module.exports = app;
