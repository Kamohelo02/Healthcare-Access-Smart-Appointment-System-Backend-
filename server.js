const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

console.log('🔍 Starting server with route isolation...');

// Test endpoint
app.get("/api/test", (req, res) => {
  res.json({ message: "Server is working! 🚀" });
});

// Test database connection
app.get("/api/db-test", async (req, res) => {
  try {
    const { poolPromise } = require('./config/db');
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT 1 as test');
    res.json({ success: true, message: 'Database connected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ STEP 1: Test if server works without any routes
console.log('1. Testing server without custom routes...');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Basic server running on port ${PORT}`);
  console.log('✅ Test: http://localhost:5000/api/test');
  console.log('✅ DB Test: http://localhost:5000/api/db-test');
  
  // ✅ STEP 2: Now try loading routes one by one
  setTimeout(() => {
    console.log('\n2. Testing route loading...');
    
    try {
      console.log('🔍 Loading auth routes...');
      const authRoutes = require("./src/routes/auth.routes");
      app.use("/api/auth", authRoutes);
      console.log('✅ Auth routes loaded successfully');
    } catch (error) {
      console.log('❌ Auth routes failed:', error.message);
      return;
    }
    
    try {
      console.log('🔍 Loading student routes...');
      const studentRoutes = require("./src/routes/student.routes");
      app.use("/api/student", studentRoutes);
      console.log('✅ Student routes loaded successfully');
    } catch (error) {
      console.log('❌ Student routes failed:', error.message);
      return;
    }
    
    try {
      console.log('🔍 Loading admin routes...');
      const adminRoutes = require("./src/routes/admin.routes");
      app.use("/api/admin", adminRoutes);
      console.log('✅ Admin routes loaded successfully');
    } catch (error) {
      console.log('❌ Admin routes failed:', error.message);
      return;
    }
    
      try {
      console.log('🔍 Loading staff routes...');
      const staffRoutes = require("./src/routes/staff.routes");
      app.use("/api/staff", staffRoutes);
      console.log('✅ staff routes loaded successfully');
    } catch (error) {
      console.log('❌ staff routes failed:', error.message);
      return;
    }
    
    console.log('🎉 All routes loaded successfully!');
    
  }, 1000);
});
