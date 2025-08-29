const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require("../config/db");
const router = express.Router();
//const authenticateToken = require('../Middleware/auth.middleware');

const JWT_SECRET = process.env.JWT_SECRET;

// POST /auth/register - Student registration
router.post('/register', async (req, res) => {
  try {
    const { email, phone, password, studentNumber, fullName } = req.body;

    // Validate required fields
    if (!email || !phone || !password || !studentNumber || !fullName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const pool = await poolPromise;

    // Check if user already exists
    const userCheck = await pool.request()
      .input('email', sql.VarChar, email)
      .input('studentNumber', sql.VarChar, studentNumber)
      .query(`
        SELECT user_id FROM Users WHERE email = @email OR 
        user_id IN (SELECT student_id FROM Student WHERE student_number = @studentNumber)
      `);

    if (userCheck.recordset.length > 0) {
      return res.status(409).json({ error: 'User already exists with this email or student number' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Create user
      const userResult = await transaction.request()
        .input('email', sql.VarChar, email)
        .input('phone', sql.VarChar, phone)
        .input('passwordHash', sql.VarChar, passwordHash)
        .query(`
          INSERT INTO Users (email, phone, password_hash, account_status, created_at) 
          OUTPUT INSERTED.user_id
          VALUES (@email, @phone, @passwordHash, 1, GETDATE())
        `);

      const userId = userResult.recordset[0].user_id;

      // Create student
      await transaction.request()
        .input('studentId', sql.Int, userId)
        .input('studentNumber', sql.VarChar, studentNumber)
        .input('fullName', sql.VarChar, fullName)
        .query(`
          INSERT INTO Student (student_id, student_number, full_name) 
          VALUES (@studentId, @studentNumber, @fullName)
        `);

      await transaction.commit();

      // Generate JWT token
      const token = jwt.sign(
        { userId, email, role: 'student' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: { userId, email, studentNumber, fullName }
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login - Student login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const pool = await poolPromise;

    // Find user
    const result = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`
        SELECT u.user_id, u.email, u.password_hash, u.account_status, 
               s.student_number, s.full_name
        FROM Users u
        INNER JOIN Student s ON u.user_id = s.student_id
        WHERE u.email = @email
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.recordset[0];

    // Check account status
    if (!user.account_status) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email, role: 'student' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        studentNumber: user.student_number,
        fullName: user.full_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;