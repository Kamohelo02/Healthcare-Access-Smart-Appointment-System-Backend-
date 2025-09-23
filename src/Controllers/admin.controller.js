const { sql, poolPromise } = require("../config/db");

// ==========================
// Users Management
// ==========================
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role: userRole, status } = req.query;
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    let query = `
      SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.create_at,
             s.student_number
      FROM UserAccount u
      LEFT JOIN Student s ON u.user_id = s.user_id
    `;

    const whereConditions = [];
    const inputs = {};

    if (userRole) {
      whereConditions.push(`u.role = @userRole`);
      inputs.userRole = userRole;
    }

    if (status) {
      whereConditions.push(`u.account_status = @status`);
      inputs.status = status === 'active' ? 1 : 0;
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ` ORDER BY u.create_at DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM UserAccount u`;
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const countRequest = pool.request();
    Object.keys(inputs).forEach(key => {
      countRequest.input(key, sql.VarChar, inputs[key]);
    });

    const countResult = await countRequest.query(countQuery);

    res.json({
      success: true,
      users: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / limit)
      }
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

exports.searchUsers = async (req, res) => {
  try {
    const { query, field = 'all' } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }

    const pool = await poolPromise;
    let searchQuery = `
      SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.create_at,
             s.student_number
      FROM UserAccount u
      LEFT JOIN Student s ON u.user_id = s.user_id
      WHERE 
    `;

    const searchConditions = [];
    const inputs = { query: `%${query}%` };

    switch (field) {
      case 'email':
        searchConditions.push(`u.email LIKE @query`);
        break;
      case 'name':
        searchConditions.push(`u.name LIKE @query`);
        break;
      case 'phone':
        searchConditions.push(`u.phone LIKE @query`);
        break;
      case 'student_number':
        searchConditions.push(`s.student_number LIKE @query`);
        break;
      default:
        searchConditions.push(`(u.email LIKE @query OR u.name LIKE @query OR u.phone LIKE @query OR s.student_number LIKE @query)`);
    }

    searchQuery += searchConditions.join(' OR ') + ` ORDER BY u.create_at DESC`;

    const result = await pool.request()
      .input('query', sql.VarChar, `%${query}%`)
      .query(searchQuery);

    res.json({
      success: true,
      users: result.recordset,
      count: result.recordset.length
    });
  } catch (err) {
    console.error("❌ Search users error:", err);
    res.status(500).json({
      success: false,
      message: "Server error searching users",
      error: err.message,
    });
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
    const { page = 1, limit = 10, status, date, nurseId } = req.query;
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    let query = `
      SELECT 
        a.appointment_id, 
        a.date_and_time, 
        a.status, 
        a.notes,
        a.booking_id,
        a.duration_minutes,
        b.user_id,
        u.name as user_name, 
        u.email,
        u.phone,
        st.name as nurse_name,
        st.staff_id as nurse_id
      FROM Appointment a
      INNER JOIN Booking b ON a.booking_id = b.booking_id
      INNER JOIN UserAccount u ON b.user_id = u.user_id
      LEFT JOIN Staff st ON a.assigned_nurse_id = st.staff_id
    `;

    const whereConditions = [];
    const inputs = {};

    if (status) {
      whereConditions.push(`a.status = @status`);
      inputs.status = status;
    }

    if (date) {
      whereConditions.push(`CAST(a.date_and_time AS DATE) = @date`);
      inputs.date = date;
    }

    if (nurseId) {
      whereConditions.push(`a.assigned_nurse_id = @nurseId`);
      inputs.nurseId = parseInt(nurseId);
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    query += ` ORDER BY a.date_and_time DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM Appointment a INNER JOIN Booking b ON a.booking_id = b.booking_id`;
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const countRequest = pool.request();
    Object.keys(inputs).forEach(key => {
      countRequest.input(key, sql.VarChar, inputs[key]);
    });

    const countResult = await countRequest.query(countQuery);

    res.json({ 
      success: true,
      appointments: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / limit)
      }
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

exports.searchAppointments = async (req, res) => {
  try {
    const { query, field = 'all' } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, message: "Search query is required" });
    }

    const pool = await poolPromise;
    let searchQuery = `
      SELECT 
        a.appointment_id, 
        a.date_and_time, 
        a.status, 
        a.notes,
        a.booking_id,
        b.user_id,
        u.name as user_name, 
        u.email,
        u.phone,
        st.name as nurse_name
      FROM Appointment a
      INNER JOIN Booking b ON a.booking_id = b.booking_id
      INNER JOIN UserAccount u ON b.user_id = u.user_id
      LEFT JOIN Staff st ON a.assigned_nurse_id = st.staff_id
      WHERE 
    `;

    const searchConditions = [];
    const inputs = { query: `%${query}%` };

    switch (field) {
      case 'user_name':
        searchConditions.push(`u.name LIKE @query`);
        break;
      case 'email':
        searchConditions.push(`u.email LIKE @query`);
        break;
      case 'nurse_name':
        searchConditions.push(`st.name LIKE @query`);
        break;
      default:
        searchConditions.push(`(u.name LIKE @query OR u.email LIKE @query OR st.name LIKE @query)`);
    }

    searchQuery += searchConditions.join(' OR ') + ` ORDER BY a.date_and_time DESC`;

    const result = await pool.request()
      .input('query', sql.VarChar, `%${query}%`)
      .query(searchQuery);

    res.json({
      success: true,
      appointments: result.recordset,
      count: result.recordset.length
    });
  } catch (err) {
    console.error("Search appointments error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error searching appointments",
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

// ==========================
// Announcements management
// ==========================
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

exports.getPeakBookingTimes = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        DATEPART(HOUR, date_and_time) as hour,
        COUNT(*) as booking_count
      FROM Appointment 
      WHERE status != 'cancelled'
      GROUP BY DATEPART(HOUR, date_and_time)
      ORDER BY booking_count DESC
    `);

    res.json({ 
      success: true,
      peakTimes: result.recordset 
    });
  } catch (err) {
    console.error("Peak booking times error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching peak booking times",
      error: err.message 
    });
  }
};

exports.getAppointmentMetrics = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // Cancelled/Missed appointments
    const cancelledResult = await pool.request().query(`
      SELECT 
        COUNT(*) as total_cancelled,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END) as missed
      FROM Appointment
      WHERE status IN ('cancelled', 'no-show')
    `);

    // Average duration
    const durationResult = await pool.request().query(`
      SELECT AVG(CAST(duration_minutes as FLOAT)) as avg_duration
      FROM Appointment 
      WHERE duration_minutes IS NOT NULL AND status = 'completed'
    `);

    res.json({ 
      success: true,
      metrics: {
        cancelled: cancelledResult.recordset[0],
        averageDuration: durationResult.recordset[0].avg_duration || 0
      }
    });
  } catch (err) {
    console.error("Appointment metrics error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching appointment metrics",
      error: err.message 
    });
  }
};

exports.getClientTypes = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      WITH UserAppointmentCounts AS (
        SELECT 
          b.user_id,
          COUNT(*) as appointment_count
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE a.status != 'cancelled'
        GROUP BY b.user_id
      )
      SELECT 
        CASE 
          WHEN appointment_count = 1 THEN 'New Client'
          ELSE 'Returning Client'
        END as client_type,
        COUNT(*) as client_count
      FROM UserAppointmentCounts
      GROUP BY CASE 
        WHEN appointment_count = 1 THEN 'New Client'
        ELSE 'Returning Client'
      END
    `);

    res.json({ 
      success: true,
      clientTypes: result.recordset 
    });
  } catch (err) {
    console.error("Client types analytics error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching client types",
      error: err.message 
    });
  }
};

exports.getMonthlyAppointments = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const pool = await poolPromise;
    
    const result = await pool.request()
      .input('year', sql.Int, year)
      .query(`
        SELECT 
          DATEPART(MONTH, date_and_time) as month,
          COUNT(*) as appointment_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM Appointment
        WHERE DATEPART(YEAR, date_and_time) = @year
        GROUP BY DATEPART(MONTH, date_and_time)
        ORDER BY month
      `);

    res.json({ 
      success: true,
      monthlyAppointments: result.recordset,
      year: parseInt(year)
    });
  } catch (err) {
    console.error("Monthly appointments error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching monthly appointments",
      error: err.message 
    });
  }
};

// ==========================
// Staff Schedule Management
// ==========================
exports.getStaffSchedules = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        ss.schedule_id,
        ss.staff_id,
        s.name as staff_name,
        ss.work_date,
        ss.start_time,
        ss.end_time,
        ss.notes
      FROM StaffSchedule ss
      INNER JOIN Staff s ON ss.staff_id = s.staff_id
      WHERE work_date >= CAST(GETDATE() AS DATE)
      ORDER BY work_date, start_time
    `);

    res.json({ 
      success: true,
      schedules: result.recordset 
    });
  } catch (err) {
    console.error("Get staff schedules error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching staff schedules",
      error: err.message 
    });
  }
};

exports.createStaffSchedule = async (req, res) => {
  try {
    const { staff_id, work_date, start_time, end_time, notes } = req.body;

    if (!staff_id || !work_date || !start_time || !end_time) {
      return res.status(400).json({ 
        success: false,
        message: "Staff ID, work date, start time, and end time are required" 
      });
    }

    const pool = await poolPromise;
    await pool.request()
      .input('staff_id', sql.Int, staff_id)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.Time, start_time)
      .input('end_time', sql.Time, end_time)
      .input('notes', sql.VarChar, notes)
      .query(`
        INSERT INTO StaffSchedule (staff_id, work_date, start_time, end_time, notes)
        VALUES (@staff_id, @work_date, @start_time, @end_time, @notes)
      `);

    res.status(201).json({ 
      success: true,
      message: "Staff schedule created successfully" 
    });
  } catch (err) {
    console.error("Create staff schedule error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error creating staff schedule",
      error: err.message 
    });
  }
};

exports.updateStaffSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { staff_id, work_date, start_time, end_time, notes } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input('schedule_id', sql.Int, id)
      .input('staff_id', sql.Int, staff_id)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.Time, start_time)
      .input('end_time', sql.Time, end_time)
      .input('notes', sql.VarChar, notes)
      .query(`
        UPDATE StaffSchedule 
        SET staff_id = @staff_id, work_date = @work_date, 
            start_time = @start_time, end_time = @end_time, notes = @notes
        WHERE schedule_id = @schedule_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Staff schedule not found" 
      });
    }

    res.json({ 
      success: true,
      message: "Staff schedule updated successfully" 
    });
  } catch (err) {
    console.error("Update staff schedule error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error updating staff schedule",
      error: err.message 
    });
  }
};

exports.deleteStaffSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;

    const result = await pool.request()
      .input('schedule_id', sql.Int, id)
      .query('DELETE FROM StaffSchedule WHERE schedule_id = @schedule_id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Staff schedule not found" 
      });
    }

    res.json({ 
      success: true,
      message: "Staff schedule deleted successfully" 
    });
  } catch (err) {
    console.error("Delete staff schedule error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error deleting staff schedule",
      error: err.message 
    });
  }
};

// ==========================
// Feedback Management
// ==========================
exports.getAllFeedback = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT f.feedback_id, f.message, f.rating, f.submitted_at, f.status,
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

exports.updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: "Valid status (approved/rejected) is required" 
      });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('feedback_id', sql.Int, id)
      .input('status', sql.VarChar, status)
      .query('UPDATE Feedback SET status = @status WHERE feedback_id = @feedback_id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Feedback not found" 
      });
    }

    res.json({ 
      success: true,
      message: "Feedback status updated successfully" 
    });
  } catch (err) {
    console.error("Update feedback status error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error updating feedback status",
      error: err.message 
    });
  }
};

// ==========================
// Report Generation
// ==========================
exports.generateReport = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    if (!type) {
      return res.status(400).json({ 
        success: false,
        message: "Report type is required" 
      });
    }

    const pool = await poolPromise;
    let reportData = {};

    switch (type) {
      case 'appointments':
        const appointmentsResult = await pool.request()
          .input('startDate', sql.Date, startDate)
          .input('endDate', sql.Date, endDate)
          .query(`
            SELECT 
              a.appointment_id,
              a.date_and_time,
              a.status,
              a.duration_minutes,
              u.name as user_name,
              u.email,
              s.name as nurse_name
            FROM Appointment a
            INNER JOIN Booking b ON a.booking_id = b.booking_id
            INNER JOIN UserAccount u ON b.user_id = u.user_id
            LEFT JOIN Staff s ON a.assigned_nurse_id = s.staff_id
            WHERE a.date_and_time BETWEEN @startDate AND DATEADD(DAY, 1, @endDate)
            ORDER BY a.date_and_time
          `);
        reportData = appointmentsResult.recordset;
        break;

      case 'users':
        const usersResult = await pool.request().query(`
          SELECT 
            u.user_id,
            u.name,
            u.email,
            u.role,
            u.account_status,
            u.create_at,
            COUNT(a.appointment_id) as total_appointments
          FROM UserAccount u
          LEFT JOIN Booking b ON u.user_id = b.user_id
          LEFT JOIN Appointment a ON b.booking_id = a.booking_id
          GROUP BY u.user_id, u.name, u.email, u.role, u.account_status, u.create_at
          ORDER BY u.create_at DESC
        `);
        reportData = usersResult.recordset;
        break;

      case 'analytics':
        const analyticsResult = await pool.request().query(`
          SELECT 
            (SELECT COUNT(*) FROM UserAccount) as total_users,
            (SELECT COUNT(*) FROM Appointment) as total_appointments,
            (SELECT COUNT(*) FROM Appointment WHERE status = 'completed') as completed_appointments,
            (SELECT COUNT(*) FROM Appointment WHERE status = 'cancelled') as cancelled_appointments,
            (SELECT AVG(CAST(duration_minutes as FLOAT)) FROM Appointment WHERE status = 'completed') as avg_duration
        `);
        reportData = analyticsResult.recordset[0];
        break;

      default:
        return res.status(400).json({ 
          success: false,
          message: "Invalid report type" 
        });
    }

    res.json({
      success: true,
      report: {
        type,
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        data: reportData
      }
    });
  } catch (err) {
    console.error("Generate report error:", err);
  }
}
