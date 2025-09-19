const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./src/Swagger/admin-swagger.json"); 

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

//  Swagger UI route
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Debug routes
app.get("/api/debug/routes", (req, res) => {
  res.json({
    message: "Debug route working",
    availableRoutes: [
      "GET /api/test",
      "GET /api/debug/routes",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET /api-docs"
    ]
  });
});

// Import routes
const adminRoutes = require("./src/routes/admin.routes");
const studentRoutes = require("./src/routes/student.routes");
const authRoutes = require("./src/routes/auth.routes");

// Mount routes
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);

app.get("/api/test", (req, res) => {
  res.json({ message: "Server is working! 🚀" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
