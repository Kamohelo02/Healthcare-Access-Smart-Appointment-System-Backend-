const { sql, poolPromise } = require("../config/db");

/** PROFILE **/
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT u.user_id, u.email, u.phone, u.name, u.create_at, u.role,
               s.student_number
        FROM UserAccount u
        LEFT JOIN Student s ON u.user_id = s.user_id
        WHERE u.user_id = @userId
      `);

    if (!result.recordset.length) return res.status(404).json({ message: "User not found" });
    const u = result.recordset[0];

    res.json({
      userId: u.user_id,
      email: u.email,
      phone: u.phone,
      name: u.name,
      studentNumber: u.student_number,
      role: u.role,
      createAt: u.create_at
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ message: "Server error fetching profile" });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { email, phone, name } = req.body;
    if (!email && !phone && !name) return res.status(400).json({ message: "Nothing to update" });

    const pool = await poolPromise;

    let q = "UPDATE UserAccount SET ";
    const req1 = pool.request().input("userId", sql.Int, userId);
    const parts = [];
    
    if (email) { parts.push("email = @email"); req1.input("email", sql.VarChar, email); }
    if (phone) { parts.push("phone = @phone"); req1.input("phone", sql.VarChar, phone); }
    if (name) { parts.push("name = @name"); req1.input("name", sql.VarChar, name); }
    
    q += parts.join(", ") + " WHERE user_id = @userId";
    await req1.query(q);

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error updating profile" });
  }
};


/** NOTIFICATIONS **/
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT n.notification_id, n.content, n.status, n.type, n.sent_at,
               a.appointment_id, a.date_and_time as appointment_date
        FROM Notification n
        INNER JOIN Appointment a ON n.appointment_id = a.appointment_id
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE b.user_id = @userId
        ORDER BY n.sent_at DESC
      `);

    res.json({ notifications: result.recordset });
  } catch (err) {
    console.error("Notifications error:", err);
    res.status(500).json({ message: "Server error fetching notifications" });
  }
};

// FAQS 
exports.getFaqs = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pool = await poolPromise;

    // Build the base query
    let baseQuery = `
      SELECT faq_id, question, answer, category, created_at 
      FROM FAQ 
      WHERE 1=1
    `;
    
    const request = pool.request();

    // Add search filter if provided
    if (search && search.trim() !== '') {
      baseQuery += " AND (question LIKE @search OR answer LIKE @search)";
      request.input("search", sql.VarChar, `%${search.trim()}%`);
    }

    // Add ordering
    baseQuery += ' ORDER BY created_at DESC';

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    baseQuery += ` OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`;

    // Execute the main query
    const result = await request.query(baseQuery);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM FAQ WHERE 1=1`;
    if (search && search.trim() !== '') {
      countQuery += " AND (question LIKE @search OR answer LIKE @search)";
    }
    
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0].total;

    res.json({ 
      faqs: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      search: {
        currentSearch: search || '',
        hasSearch: !!(search && search.trim() !== '')
      }
    });

  } catch (err) {
    console.error("FAQs error:", err);
    res.status(500).json({ message: "Server error fetching FAQs" });
  }
};

// ANNOUNCEMENTS - SEARCH AND FILTER 
exports.getAnnouncements = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pool = await poolPromise;

    // Build the base query
    let baseQuery = `
      SELECT a.announcement_id, a.title, a.content, a.created_at,
             u.name as author_name
      FROM Announcement a
      INNER JOIN UserAccount u ON a.user_id = u.user_id
      WHERE 1=1
    `;
    
    const request = pool.request();

    // Add search filter if provided
    if (search && search.trim() !== '') {
      baseQuery += " AND (a.title LIKE @search OR a.content LIKE @search)";
      request.input("search", sql.VarChar, `%${search.trim()}%`);
    }

    // Add ordering (newest first)
    baseQuery += ' ORDER BY a.created_at DESC';

    // Add pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    baseQuery += ` OFFSET ${offset} ROWS FETCH NEXT ${parseInt(limit)} ROWS ONLY`;

    // Execute the main query
    const result = await request.query(baseQuery);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM Announcement a
      WHERE 1=1
    `;
    if (search && search.trim() !== '') {
      countQuery += " AND (a.title LIKE @search OR a.content LIKE @search)";
    }
    
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0].total;

    res.json({ 
      announcements: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      search: {
        currentSearch: search || '',
        hasSearch: !!(search && search.trim() !== '')
      }
    });

  } catch (err) {
    console.error("Announcements error:", err);
    res.status(500).json({ message: "Server error fetching announcements" });
  }
};

/** APPOINTMENTS **/
exports.bookAppointment = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { dateTime, reason } = req.body;
    if (!dateTime) return res.status(400).json({ message: "Missing dateTime" });

    const pool = await poolPromise;
    
    // First create booking
    const bookingResult = await pool.request()
      .input("userId", sql.Int, userId)
      .input("requestedTime", sql.DateTime, new Date(dateTime))
      .query(`
        INSERT INTO Booking (user_id, status, requested_time_date, create_at)
        OUTPUT INSERTED.booking_id
        VALUES (@userId, 'requested', @requestedTime, GETDATE())
      `);
    
    const bookingId = bookingResult.recordset[0].booking_id;

    // Then create appointment
    await pool.request()
      .input("bookingId", sql.Int, bookingId)
      .input("userId", sql.Int, userId)
      .input("dateTime", sql.DateTime, new Date(dateTime))
      .input("reason", sql.NVarChar, reason || null)
      .query(`
        INSERT INTO Appointment (booking_id, user_id, date_and_time, status, notes)
        VALUES (@bookingId, @userId, @dateTime, 'scheduled', @reason)
      `);

    res.status(201).json({ message: "Appointment booked successfully" });
  } catch (err) {
    console.error("Book appointment error:", err);
    res.status(500).json({ message: "Server error booking appointment" });
  }
};

// Get appointments
exports.getMyAppointments = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const pool = await poolPromise;
    const now = new Date();

    const upcoming = await pool.request()
      .input("userId", sql.Int, userId)
      .input("now", sql.DateTime, now)
      .query(`
        SELECT a.appointment_id, a.booking_id, a.date_and_time, a.status, a.notes,
               b.requested_time_date, b.create_at as booking_create
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE a.user_id = @userId AND a.date_and_time > @now
        ORDER BY a.date_and_time ASC
      `);

    const past = await pool.request()
      .input("userId", sql.Int, userId)
      .input("now", sql.DateTime, now)
      .query(`
        SELECT a.appointment_id, a.booking_id, a.date_and_time, a.status, a.notes,
               b.requested_time_date, b.create_at as booking_create
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE a.user_id = @userId AND a.date_and_time <= @now
        ORDER BY a.date_and_time DESC
      `);

    res.json({ upcoming: upcoming.recordset, past: past.recordset });
  } catch (err) {
    console.error("Get appointments error:", err);
    res.status(500).json({ message: "Server error fetching appointments" });
  }
};

// Reschedule appointment
exports.rescheduleAppointment = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    const { dateTime, reason } = req.body;
    if (!dateTime && !reason) return res.status(400).json({ message: "Nothing to update" });

    const pool = await poolPromise;

    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("userId", sql.Int, userId)
      .input("dateTime", sql.DateTime, dateTime ? new Date(dateTime) : null)
      .input("reason", sql.NVarChar, reason || null)
      .query(`
        UPDATE Appointment
        SET date_and_time = COALESCE(@dateTime, date_and_time),
            notes = COALESCE(@reason, notes)
        WHERE appointment_id = @id AND user_id = @userId
      `);

    if (!result.rowsAffected[0]) return res.status(404).json({ message: "Appointment not found" });
    res.json({ message: "Appointment rescheduled successfully" });
  } catch (err) {
    console.error("Reschedule error:", err);
    res.status(500).json({ message: "Server error rescheduling appointment" });
  }
};

// Cancel appointment
exports.cancelAppointment = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    const pool = await poolPromise;
    
    // Update appointment status to cancelled
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("userId", sql.Int, userId)
      .query(`
        UPDATE Appointment
        SET status = 'cancelled'
        WHERE appointment_id = @id AND user_id = @userId
      `);

    if (!result.rowsAffected[0]) return res.status(404).json({ message: "Appointment not found" });
    res.json({ message: "Appointment cancelled successfully" });
  } catch (err) {
    console.error("Cancel error:", err);
    res.status(500).json({ message: "Server error cancelling appointment" });
  }
};

/** FEEDBACK **/
exports.submitFeedback = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { appointment_id, message, rating } = req.body;
    
    if (!appointment_id || !message) {
      return res.status(400).json({ message: "Appointment ID and message are required" });
    }

    const pool = await poolPromise;
    
    await pool.request()
      .input("userId", sql.Int, userId)
      .input("appointmentId", sql.Int, appointment_id)
      .input("message", sql.NVarChar, message)
      .input("rating", sql.Int, rating || null)
      .query(`
        INSERT INTO Feedback (user_id, appointment_id, message, rating, submitted_at)
        VALUES (@userId, @appointmentId, @message, @rating, GETDATE())
      `);

    res.status(201).json({ message: "Feedback submitted successfully" });
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ message: "Server error submitting feedback" });
  }
};