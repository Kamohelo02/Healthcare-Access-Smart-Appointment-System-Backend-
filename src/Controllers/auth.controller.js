const { sql, poolPromise } = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Register user
const register = async (req, res) => {
  try {
    console.log("Register request received:", req.body);
    
    const { email, password, name, phone, role, studentNumber, position } = req.body;

    // ✅ Validate required fields
    if (!email || !password || !name || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const pool = await poolPromise;

    // ✅ Check if email already exists
    const exists = await pool.request()
      .input("email", sql.VarChar, email)
      .query("SELECT user_id FROM UserAccount WHERE email = @email");

    if (exists.recordset.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    // ✅ CORRECT: Create transaction INSIDE try block
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. First create UserAccount
      const userResult = await transaction.request()
        .input("email", sql.VarChar, email)
        .input("name", sql.VarChar, name)
        .input("password_hash", sql.VarChar, hash)
        .input("phone", sql.VarChar, phone || "")
        .input("role", sql.VarChar, role)
        .query(`
          INSERT INTO UserAccount (email, name, password_hash, phone, role, create_at)
          OUTPUT INSERTED.user_id
          VALUES (@email, @name, @password_hash, @phone, @role, GETDATE())
        `);
      
      const userId = userResult.recordset[0].user_id;

      // 2. If student, insert into Student table
      if (role === "student") {
        if (!studentNumber) {
          throw new Error("Student number is required for student registration");
        }

        await transaction.request()
          .input("userId", sql.Int, userId)
          .input("studentNumber", sql.VarChar, studentNumber)
          .query(`
            INSERT INTO Student (user_id, student_number)
            VALUES (@userId, @studentNumber)
          `);
      }

      // 3. If staff or admin, insert into Staff table
      if (role === "staff" || role === "admin") {
        if (role === "staff" && !position) {
          throw new Error("Position is required for staff registration");
        }

        await transaction.request()
          .input("userId", sql.Int, userId)
          .input("position", sql.VarChar, position || "Administrator")
          .input("isAdmin", sql.Bit, role === "admin" ? 1 : 0)
          .query(`
            INSERT INTO Staff (user_id, position, is_admin)
            VALUES (@userId, @position, @isAdmin)
          `);
      }

      await transaction.commit();

      // ✅ Generate JWT
      const tokenPayload = { user_id: userId, role, email, name };
      if (role === "student") tokenPayload.student_number = studentNumber;
      if (role === "staff") tokenPayload.position = position;

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "24h" });

      res.status(201).json({
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} registration successful`,
        token,
        user: {
          userId,
          email,
          name,
          phone,
          role,
          ...(role === "student" && { studentNumber }),
          ...(role === "staff" && { position }),
        },
      });

    } catch (error) {
      // ✅ Only rollback if transaction has begun
      if (transaction._begun) {
        await transaction.rollback();
      }
      throw error;
    }

  } catch (err) {
    console.error("Registration error:", err);
    
    // ✅ Better error messages
    let errorMessage = "Server error during registration";
    if (err.message.includes("required")) {
      errorMessage = err.message;
    }
    
    res.status(500).json({ 
      message: errorMessage,
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
               s.student_number, st.position, st.is_admin
        FROM UserAccount u
        LEFT JOIN Student s ON u.user_id = s.user_id
        LEFT JOIN Staff st ON u.user_id = st.user_id
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

    const tokenPayload = {
      user_id: user.user_id,
      role: user.role,
      email: user.email,
      name: user.name,
      student_number: user.student_number,
      position: user.position,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.json({
      message: "Login successful",
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        studentNumber: user.student_number,
        name: user.name,
        phone: user.phone,
        role: user.role,
        position: user.position,
        isAdmin: user.is_admin,
      },
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
