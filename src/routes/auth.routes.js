const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const auth = require("../middleware/auth.middleware");

router.get("auth/debug/useraccount-columns", async (req, res) => {
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
  console.log(`Auth route: ${req.method} ${req.url}`);
  next();
});


// Auth routes
router.post("/register", authController.register);
router.post("/login", authController.login);

// Debug middleware
router.use((req, res, next) => {
  console.log("Auth route called:", req.method, req.url);
  next();
});

module.exports = router;