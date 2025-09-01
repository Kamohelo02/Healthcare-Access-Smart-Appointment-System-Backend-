const { sql, poolPromise } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register user
const register = async (req, res) => {
  try {
    console.log("Register request received:", req.body);
    
    const { email, password, studentNumber, name, phone } = req.body;
    
    // Validation - Note: 'name' instead of 'fullName'
    if (!email || !password || !studentNumber || !name) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const pool = await poolPromise;

    // Check existing user
    const exists = await pool.request()
      .input("email", sql.VarChar, email)
      .query("SELECT user_id FROM UserAccount WHERE email = @email");
    
    if (exists.recordset.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    // Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. First create UserAccount
      const userResult = await transaction.request()
        .input("email", sql.VarChar, email)
        .input("name", sql.VarChar, name)
        .input("password_hash", sql.VarChar, hash)
        .input("phone", sql.VarChar, phone || "")
        .input("role", sql.VarChar, "student")
        .query(`
          INSERT INTO UserAccount (email, name, password_hash, phone, role, create_at)
          OUTPUT INSERTED.user_id
          VALUES (@email, @name, @password_hash, @phone, @role, GETDATE())
        `);
      
      const userId = userResult.recordset[0].user_id;

      // 2. Then create Student record
      await transaction.request()
        .input("userId", sql.Int, userId)
        .input("studentNumber", sql.VarChar, studentNumber)
        .query(`
          INSERT INTO Student (user_id, student_number)
          VALUES (@userId, @studentNumber)
        `);
      
      await transaction.commit();

      // JWT
      const token = jwt.sign(
        { 
          user_id: userId, 
          role: "student", 
          email: email, 
          student_number: studentNumber,
          name: name
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: "24h" }
      );

      res.status(201).json({ 
        message: "Registration successful", 
        token: token,
        user: { userId, email, studentNumber, name, phone }
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ 
      message: "Server error during registration",
      error: err.message 
    });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input("email", sql.VarChar, email)
      .query(`
        SELECT u.user_id, u.email, u.password_hash, u.role, u.name, u.phone,
               s.student_number
        FROM UserAccount u
        LEFT JOIN Student s ON u.user_id = s.user_id
        WHERE u.email = @email
      `);

    if (!result.recordset.length) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.recordset[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    
    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { 
        user_id: user.user_id, 
        role: user.role, 
        email: user.email, 
        student_number: user.student_number,
        name: user.name
      },
      process.env.JWT_SECRET,
      { expiresIn: "7h" }
    );

    res.json({ 
      message: "Login successful", 
      token: token,
      user: {
        userId: user.user_id,
        email: user.email,
        studentNumber: user.student_number,
        name: user.name,
        phone: user.phone,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
};

module.exports = {
  register,
  login
};