const jwt = require("jsonwebtoken");
const { poolPromise } = require("../config/db"); 
const sql = require("mssql"); 

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    //  Verify user still exists in database
    try {
      const pool = await poolPromise;
      const userResult = await pool.request()
        .input("userId", sql.Int, decoded.user_id)
        .query("SELECT user_id FROM UserAccount WHERE user_id = @userId AND account_status = 1");
      
      if (userResult.recordset.length === 0) {
        return res.status(403).json({ message: "User no longer exists or is disabled" });
      }
    } catch (dbError) {
      console.error("Database check error:", dbError);
      // Continue anyway - don't fail auth if database check fails
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token expired" });
    }
    
    if (err.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    }
    
    res.status(500).json({ message: "Server error during authentication" });
  }
};

module.exports = auth;