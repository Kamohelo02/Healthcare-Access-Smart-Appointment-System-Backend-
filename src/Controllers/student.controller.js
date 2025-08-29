const { sql, poolPromise } = require("../config/db");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/* ------------------- auth (Registration and login) ----------------*/
exports.userRegistration = async (req, res) => {
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
};

exports.userLogin = async (req, res) => {
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
};

/* ----------------Profile ---------------------------*/
exports.getProfile = async (req, res) => {
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
};

exports.updateProfile = async (req, res) => {
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
};

