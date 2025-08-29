const express = require('express');
const { sql, poolPromise } = require("../config/db");
const authenticateToken = require('../Middleware/auth.middleware');
const router = express.Router();

// GET /profile - View student profile
router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT u.user_id, u.email, u.phone, u.created_at,
               s.student_number, s.full_name
        FROM Users u
        INNER JOIN Student s ON u.user_id = s.student_id
        WHERE u.user_id = @userId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.recordset[0];
    res.json({
      userId: user.user_id,
      email: user.email,
      phone: user.phone,
      studentNumber: user.student_number,
      fullName: user.full_name,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /profile - Update student profile
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { email, phone, fullName } = req.body;
    const userId = req.user.userId;

    // Validate at least one field to update
    if (!email && !phone && !fullName) {
      return res.status(400).json({ error: 'At least one field is required for update' });
    }

    const pool = await poolPromise;

    // Check if email is already taken by another user
    if (email) {
      const emailCheck = await pool.request()
        .input('email', sql.VarChar, email)
        .input('userId', sql.Int, userId)
        .query('SELECT user_id FROM Users WHERE email = @email AND user_id != @userId');

      if (emailCheck.recordset.length > 0) {
        return res.status(409).json({ error: 'Email already in use by another account' });
      }
    }

    // Build dynamic update query
    let updateUserQuery = 'UPDATE Users SET ';
    let updateStudentQuery = 'UPDATE Student SET ';
    const userInputs = {};
    const studentInputs = { userId };

    if (email) {
      updateUserQuery += 'email = @email, ';
      userInputs.email = email;
    }
    if (phone) {
      updateUserQuery += 'phone = @phone, ';
      userInputs.phone = phone;
    }
    if (fullName) {
      updateStudentQuery += 'full_name = @fullName, ';
      studentInputs.fullName = fullName;
    }

    // Remove trailing commas and add WHERE clause
    updateUserQuery = updateUserQuery.replace(/,\s*$/, '') + ' WHERE user_id = @userId';
    updateStudentQuery = updateStudentQuery.replace(/,\s*$/, '') + ' WHERE student_id = @userId';

    // Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Update Users table
      if (email || phone) {
        const userRequest = transaction.request();
        userRequest.input('userId', sql.Int, userId);
        
        if (email) userRequest.input('email', sql.VarChar, email);
        if (phone) userRequest.input('phone', sql.VarChar, phone);
        
        await userRequest.query(updateUserQuery);
      }

      // Update Student table
      if (fullName) {
        await transaction.request()
          .input('userId', sql.Int, userId)
          .input('fullName', sql.VarChar, fullName)
          .query(updateStudentQuery);
      }

      await transaction.commit();

      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;