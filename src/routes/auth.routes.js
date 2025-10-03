const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { sql, poolPromise } = require("../config/db");
const auth = require("../middleware/auth.middleware");

// ✅ FIXED: Remove the leading "auth/" 
router.get("/debug/useraccount-columns", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'UserAccount'
        ORDER BY ORDINAL_POSITION
      `);
    
    res.json({ columns: result.recordset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug middleware
router.use((req, res, next) => {
  console.log("Auth route called:", req.method, req.url);
  next();
});

// Auth routes (these are correct)
router.post("/register", authController.register);
router.post("/login", authController.login);

module.exports = router;