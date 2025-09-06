const { sql, poolPromise } = require("../config/db");

// ==========================
// Users Management
// ==========================
exports.getAllUsers = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.create_at,
             s.student_number
      FROM UserAccount u
      LEFT JOIN Student s ON u.user_id = s.user_id
      ORDER BY u.create_at DESC
    `);

    res.json({
      success: true,
      users: result.recordset,
      count: result.recordset.length,
    });
  } catch (err) {
    console.error("❌ Get all users error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching users",
      error: err.message,
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("userId", sql.Int, id)
      .query(`
        SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.create_at,
               s.student_number
        FROM UserAccount u
        LEFT JOIN Student s ON u.user_id = s.user_id
        WHERE u.user_id = @userId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: result.recordset[0] });
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ message: "Server error fetching user" });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { account_status } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("userId", sql.Int, id)
      .input("status", sql.Bit, account_status)
      .query(`
        UPDATE UserAccount 
        SET account_status = @status 
        WHERE user_id = @userId
      `);

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User status updated successfully" });
  } catch (err) {
    console.error("Update user status error:", err);
    res.status(500).json({ message: "Server error updating user status" });
  }
};

exports.deleteUser = async (req, res) => {
  const transaction = new sql.Transaction(await poolPromise);
  try {
    const { id } = req.params;

    await transaction.begin();

    // Delete child records first
    await transaction.request()
      .input("userId", sql.Int, id)
      .query("DELETE FROM Student WHERE user_id = @userId");

    await transaction.request()
      .input("userId", sql.Int, id)
      .query("DELETE FROM Staff WHERE user_id = @userId");

    // Delete user
    const result = await transaction.request()
      .input("userId", sql.Int, id)
      .query("DELETE FROM UserAccount WHERE user_id = @userId");

    if (!result.rowsAffected[0]) {
      await transaction.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    await transaction.commit();
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    await transaction.rollback();
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Server error deleting user" });
  }
};

// ==========================
// Appointments management
// ==========================

exports.getAllAppointments = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        a.appointment_id, 
        a.date_and_time, 
        a.status, 
        a.notes,
        a.booking_id,
        b.user_id,
        u.name as user_name, 
        u.email,
        u.phone
      FROM Appointment a
      INNER JOIN Booking b ON a.booking_id = b.booking_id
      INNER JOIN UserAccount u ON b.user_id = u.user_id
      ORDER BY a.date_and_time DESC
    `);

    res.json({ 
      success: true,
      appointments: result.recordset,
      count: result.recordset.length
    });
  } catch (err) {
    console.error("Get appointments error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching appointments",
      error: err.message 
    });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;
    
    // First, check if appointment exists
    const checkResult = await pool.request()
      .input("appointmentId", sql.Int, id)
      .query("SELECT appointment_id FROM Appointment WHERE appointment_id = @appointmentId");

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Appointment not found" 
      });
    }

    // Delete the appointment
    const result = await pool.request()
      .input("appointmentId", sql.Int, id)
      .query("DELETE FROM Appointment WHERE appointment_id = @appointmentId");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Appointment not found or already deleted" 
      });
    }

    res.json({ 
      success: true,
      message: "Appointment deleted successfully" 
    });
  } catch (err) {
    console.error("Delete appointment error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error deleting appointment",
      error: err.message 
    });
  }
};

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ 
        success: false,
        message: "Status is required" 
      });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("appointmentId", sql.Int, id)
      .input("status", sql.VarChar, status)
      .query(`
        UPDATE Appointment 
        SET status = @status 
        WHERE appointment_id = @appointmentId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Appointment not found" 
      });
    }

    res.json({ 
      success: true,
      message: "Appointment status updated successfully" 
    });
  } catch (err) {
    console.error("Update appointment error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error updating appointment",
      error: err.message 
    });
  }
};

// ==========================
// FAQs management
// ==========================
exports.getAllFaqs = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT faq_id, question, answer, category, created_at
      FROM FAQ 
      ORDER BY created_at DESC
    `);

    res.json({ faqs: result.recordset });
  } catch (err) {
    console.error("Get FAQs error:", err);
    res.status(500).json({ message: "Server error fetching FAQs" });
  }
};

exports.createFaq = async (req, res) => {
  try {
    const { question, answer, category } = req.body || {}; // fallback if body undefined
    const userId = req.user.user_id;

    // Validate input
    if (!question || !answer) {
      return res.status(400).json({ message: "Question and answer are required" });
    }

    const pool = await poolPromise;
    await pool.request()
      .input("userId", sql.Int, userId)
      .input("question", sql.VarChar, question)
      .input("answer", sql.VarChar, answer)
      .input("category", sql.VarChar, category)
      .query(`
        INSERT INTO FAQ (user_id, question, answer, category, created_at)
        VALUES (@userId, @question, @answer, @category, GETDATE())
      `);

    res.status(201).json({ message: "FAQ created successfully" });
  } catch (err) {
    console.error("Create FAQ error:", err);
    res.status(500).json({ message: "Server error creating FAQ" });
  }
};


exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("faqId", sql.Int, id)
      .input("question", sql.VarChar, question)
      .input("answer", sql.VarChar, answer)
      .input("category", sql.VarChar, category)
      .query(`
        UPDATE FAQ 
        SET question = @question, answer = @answer, category = @category 
        WHERE faq_id = @faqId
      `);

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    res.json({ message: "FAQ updated successfully" });
  } catch (err) {
    console.error("Update FAQ error:", err);
    res.status(500).json({ message: "Server error updating FAQ" });
  }
};

exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("faqId", sql.Int, id)
      .query("DELETE FROM FAQ WHERE faq_id = @faqId");

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    res.json({ message: "FAQ deleted successfully" });
  } catch (err) {
    console.error("Delete FAQ error:", err);
    res.status(500).json({ message: "Server error deleting FAQ" });
  }
};


// Announcements management
// Create a new announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content } = req.body;

    // Validate input
    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const pool = await poolPromise;

    await pool.request()
      .input("userId", sql.Int, req.user.user_id) 
      .input("title", sql.VarChar, title)
      .input("content", sql.VarChar, content)
      .query(`
        INSERT INTO Announcement (user_id, title, content, created_at)
        VALUES (@userId, @title, @content, GETDATE())
      `);

    res.status(201).json({ message: "Announcement created successfully" });
  } catch (err) {
    console.error("Create Announcement error:", err);
    res.status(500).json({
      message: "Error creating announcement",
      error: err.message,
    });
  }
};

// Update an existing announcement
exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Title and content are required" });
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input("announcementId", sql.Int, id)
      .input("title", sql.VarChar, title)
      .input("content", sql.VarChar, content)
      .query(`
        UPDATE Announcement
        SET title = @title, content = @content
        WHERE announcement_id = @announcementId
      `);

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json({ message: "Announcement updated successfully" });
  } catch (err) {
    console.error("Update Announcement error:", err);
    res.status(500).json({ message: "Server error updating announcement" });
  }
};

// Delete an announcement
exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("announcementId", sql.Int, id)
      .query("DELETE FROM Announcement WHERE announcement_id = @announcementId");

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    res.json({ message: "Announcement deleted successfully" });
  } catch (err) {
    console.error("Delete Announcement error:", err);
    res.status(500).json({ message: "Server error deleting announcement" });
  }
};

// Get all announcements (optional helper)
exports.getAnnouncements = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .query("SELECT announcement_id, user_id, title, content, created_at FROM Announcement ORDER BY created_at DESC");

    res.json(result.recordset);
  } catch (err) {
    console.error("Get Announcements error:", err);
    res.status(500).json({ message: "Server error fetching announcements" });
  }
};

// ==========================
// System Settings
// ==========================
exports.getSystemSettings = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT config_key, config_value, description 
      FROM SystemConfiguration
    `);

    res.json({ settings: result.recordset });
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ message: "Server error fetching settings" });
  }
};

// ==========================
// Analytics
// ==========================
exports.getUserAnalytics = async (req, res) => {
  try {
    const pool = await poolPromise;
    const userCounts = await pool.request().query(`
      SELECT role, COUNT(*) as count 
      FROM UserAccount 
      GROUP BY role
    `);

    res.json({ analytics: userCounts.recordset });
  } catch (err) {
    console.error("User analytics error:", err);
    res.status(500).json({ message: "Server error fetching user analytics" });
  }
};

exports.getAppointmentAnalytics = async (req, res) => {
  try {
    const pool = await poolPromise;
    const appointmentStats = await pool.request().query(`
      SELECT status, COUNT(*) as count 
      FROM Appointment 
      GROUP BY status
    `);

    res.json({ analytics: appointmentStats.recordset });
  } catch (err) {
    console.error("Appointment analytics error:", err);
    res.status(500).json({ message: "Server error fetching appointment analytics" });
  }
};

// ==========================
// Feedback
// ==========================
exports.getAllFeedback = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT f.feedback_id, f.message, f.rating, f.submitted_at,
             u.name as user_name, u.email
      FROM Feedback f
      INNER JOIN UserAccount u ON f.user_id = u.user_id
      ORDER BY f.submitted_at DESC
    `);

    res.json({ feedback: result.recordset });
  } catch (err) {
    console.error("Get feedback error:", err);
    res.status(500).json({ message: "Server error fetching feedback" });
  }
};


