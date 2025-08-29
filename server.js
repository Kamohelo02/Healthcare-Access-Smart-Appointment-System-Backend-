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

const studentRoutes = require("./src/routes/student.routes");
app.use("/student", studentRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

