const { sql, poolPromise } = require("../config/db");

/** PROFILE **/
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const pool = await poolPromise;

    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT u.user_id, u.email, u.phone, u.name, u.created_at, u.role,
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
//========================
//  Appointment management
//========================
exports.bookAppointment = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { dateTime, serviceId } = req.body;

    if (!dateTime || !serviceId) {
      return res.status(400).json({ message: "Missing required fields: dateTime, serviceId" });
    }

    const pool = await poolPromise;
    const requestedTime = new Date(dateTime);
    
    // Match the VARCHAR format used in StaffSchedule
    const requestedDate = new Date(dateTime).toISOString().split('T')[0];
    const requestedTimeOnly = new Date(dateTime).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }); // Format: "10:30" (matches your StaffSchedule format)

    console.log("📅 Booking Request:", {
      userId,
      dateTime: requestedTime,
      date: requestedDate,
      time: requestedTimeOnly, 
      serviceId
    });

    // 1. Check if student already has an appointment at this time
    const conflictCheck = await pool.request()
      .input("userId", sql.Int, userId)
      .input("dateTime", sql.DateTime, requestedTime)
      .query(`
        SELECT a.appointment_id
        FROM Appointment a
        JOIN Booking b ON a.booking_id = b.booking_id
        WHERE b.user_id = @userId 
          AND CAST(a.date_and_time AS DATE) = CAST(@dateTime AS DATE)
          AND a.status IN ('scheduled', 'pending', 'confirmed')
      `);

    if (conflictCheck.recordset.length > 0) {
      return res.status(400).json({ message: "You already have an appointment at this time." });
    }

    // 2. FIXED: Check staff availability using VARCHAR comparison (matching StaffSchedule format)
    const staffCheck = await pool.request()
      .input("requestedDate", sql.Date, requestedDate)
      .input("requestedTime", sql.VarChar(5), requestedTimeOnly) // Match VARCHAR(5) format like "10:30"
      .input("requestedDateTime", sql.DateTime, requestedTime)
      .query(`
        SELECT TOP 1 
          ss.user_id,
          ss.schedule_id,
          ua.name as staff_name
        FROM StaffSchedule ss
        INNER JOIN UserAccount ua ON ss.user_id = ua.user_id
        WHERE ss.work_date = @requestedDate
          AND @requestedTime BETWEEN ss.start_time AND ss.end_time
          AND ss.user_id NOT IN (
            -- Exclude staff who already have appointments at this time
            SELECT DISTINCT sb.staff_id
            FROM StaffBooking sb
            INNER JOIN Booking b ON sb.booking_id = b.booking_id
            INNER JOIN Appointment a ON b.booking_id = a.booking_id
            WHERE CAST(a.date_and_time AS DATE) = @requestedDate
              AND CONVERT(VARCHAR(5), CAST(a.date_and_time AS TIME), 108) = @requestedTime
              AND a.status IN ('scheduled', 'pending', 'confirmed')
          )
        ORDER BY ss.user_id
      `);

    console.log("🔍 Staff Check Results:", staffCheck.recordset);

    if (staffCheck.recordset.length === 0) {
      // Debug: Check what schedules exist for this date/time
      const debugSchedules = await pool.request()
        .input("requestedDate", sql.Date, requestedDate)
        .input("requestedTime", sql.VarChar(5), requestedTimeOnly)
        .query(`
          SELECT 
            ss.user_id,
            ss.work_date,
            ss.start_time,
            ss.end_time,
            @requestedTime as requested_time,
            CASE 
              WHEN @requestedTime BETWEEN ss.start_time AND ss.end_time
              THEN 'MATCH' 
              ELSE 'NO MATCH' 
            END as time_match
          FROM StaffSchedule ss
          WHERE ss.work_date = @requestedDate
        `);
      
      console.log("🔍 DEBUG - Schedule Analysis:", debugSchedules.recordset);
      
      return res.status(400).json({ 
        message: "No staff available at this time. Please choose a different time slot." 
      });
    }

    const assignedStaffId = staffCheck.recordset[0].user_id;
    const staffName = staffCheck.recordset[0].staff_name;

    console.log("✅ Available Staff Found:", { assignedStaffId, staffName });

    // 3. Create booking
    const bookingResult = await pool.request()
      .input("userId", sql.Int, userId)
      .input("serviceId", sql.Int, serviceId)
      .input("requestedTime", sql.DateTime, requestedTime)
      .query(`
        INSERT INTO Booking (user_id, service_id, status, requested_time_date, created_at)
        OUTPUT INSERTED.booking_id
        VALUES (@userId, @serviceId, 'pending', @requestedTime, GETDATE())
      `);

    const bookingId = bookingResult.recordset[0].booking_id;

    // 4. Link staff to booking
    await pool.request()
      .input("bookingId", sql.Int, bookingId)
      .input("staffId", sql.Int, assignedStaffId)
      .query(`
        INSERT INTO StaffBooking (booking_id, staff_id)
        VALUES (@bookingId, @staffId)
      `);

    // 5. Create appointment
    await pool.request()
      .input("bookingId", sql.Int, bookingId)
      .input("dateTime", sql.DateTime, requestedTime)
      .input("nurseName", sql.VarChar, staffName)
      .query(`
        INSERT INTO Appointment (booking_id, date_and_time, status, duration_minutes, nurse_name)
        VALUES (@bookingId, @dateTime, 'pending', 30, @nurseName)
      `);

    // 6. Get appointment ID for notification
    const appointmentResult = await pool.request()
      .input("bookingId", sql.Int, bookingId)
      .query(`
        SELECT appointment_id FROM Appointment WHERE booking_id = @bookingId
      `);

    const appointmentId = appointmentResult.recordset[0].appointment_id;

    // 7. Create notification
    await pool.request()
      .input("appointmentId", sql.Int, appointmentId)
      .input("userId", sql.Int, userId)
      .input("content", sql.NVarChar, `Appointment booked for ${requestedTime.toLocaleString()}. Status: Pending approval.`)
      .input("type", sql.VarChar, "booking_created")
      .input("status", sql.VarChar, "unread")
      .query(`
        INSERT INTO Notification (appointment_id, user_id, content, type, status, sent_at)
        VALUES (@appointmentId, @userId, @content, @type, @status, GETDATE())
      `);

    res.status(201).json({ 
      success: true,
      message: "Appointment booked successfully and pending staff approval",
      data: {
        bookingId: bookingId,
        appointmentId: appointmentId,
        staffAssigned: staffName,
        scheduledTime: requestedTime,
        status: 'pending'
      }
    });

  } catch (err) {
    console.error("Book appointment error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error booking appointment",
      error: err.message 
    });
  }
};


exports.getMyAppointments = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const pool = await poolPromise;
    const now = new Date();

    // Upcoming
    const upcoming = await pool.request()
      .input("userId", sql.Int, userId)
      .input("now", sql.DateTime, now)
      .query(`
        SELECT a.appointment_id, a.date_and_time, a.status, a.duration_minutes,
               b.booking_id, b.requested_time_date, b.created_at AS booking_created,
               s.name AS service_name, s.category AS service_category
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        INNER JOIN ServiceType s ON b.service_id = s.service_id
        WHERE b.user_id = @userId AND a.date_and_time > @now
        ORDER BY a.date_and_time ASC
      `);

    // Past
    const past = await pool.request()
      .input("userId", sql.Int, userId)
      .input("now", sql.DateTime, now)
      .query(`
        SELECT a.appointment_id, a.date_and_time, a.status, a.duration_minutes,
               b.booking_id, b.requested_time_date, b.created_at AS booking_created,
               s.name AS service_name, s.category AS service_category
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        INNER JOIN ServiceType s ON b.service_id = s.service_id
        WHERE b.user_id = @userId AND a.date_and_time <= @now
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
    const { dateTime } = req.body;

    if (!dateTime) {
      return res.status(400).json({ message: "New dateTime required for rescheduling" });
    }

    const pool = await poolPromise;
    const newDate = new Date(dateTime);

    // Check if appointment belongs to user
    const existing = await pool.request()
      .input("id", sql.Int, id)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT a.appointment_id, a.status
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE a.appointment_id = @id AND b.user_id = @userId
      `);

    if (existing.recordset.length === 0) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check staff availability
    const staffCheck = await pool.request()
      .input("dateTime", sql.DateTime, newDate)
      .query(`
        SELECT TOP 1 s.user_id, s.schedule_id
        FROM StaffSchedule s
        WHERE s.work_date = CAST(@dateTime AS DATE)
          AND @dateTime BETWEEN CAST(s.start_time AS DATETIME) AND CAST(s.end_time AS DATETIME)
      `);

    if (staffCheck.recordset.length === 0) {
      return res.status(400).json({ message: "No staff available at this new time" });
    }

    // Update appointment
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("dateTime", sql.DateTime, newDate)
      .query(`
        UPDATE Appointment
        SET date_and_time = @dateTime, status = 'rescheduled'
        WHERE appointment_id = @id
      `);

    if (!result.rowsAffected[0]) {
      return res.status(400).json({ message: "Could not reschedule appointment" });
    }

    res.json({ message: "Appointment rescheduled successfully" });
  } catch (err) {
    console.error("Reschedule error:", err);
    res.status(500).json({ message: "Server error rescheduling appointment" });
  }
};


exports.cancelAppointment = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    const pool = await poolPromise;

    // Ensure user owns the appointment
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("userId", sql.Int, userId)
      .query(`
        UPDATE a
        SET status = 'cancelled'
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE a.appointment_id = @id AND b.user_id = @userId
      `);

    if (!result.rowsAffected[0]) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    res.json({ message: "Appointment cancelled successfully" });
  } catch (err) {
    console.error("Cancel error:", err);
    res.status(500).json({ message: "Server error cancelling appointment" });
  }
};

// Student Feedback Endpoints
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
        INSERT INTO FeedbackBuffer (user_id, appointment_id, message, rating, submitted_at, status)
        VALUES (@userId, @appointmentId, @message, @rating, GETDATE(), 'pending')
      `);

    res.status(201).json({ 
      success: true,
      message: "Feedback submitted successfully and awaiting approval" 
    });
  } catch (err) {
    console.error("Feedback submission error:", err);
    res.status(500).json({ message: "Server error submitting feedback" });
  }
};

// Get approved feedback for students
exports.getApprovedFeedback = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT ff.message, ff.rating, ff.submitted_at, ff.reviewed_at,
             u.name as user_name, u.email
      FROM FeedbackFinal ff
      INNER JOIN UserAccount u ON ff.user_id = u.user_id
      WHERE ff.status = 'approved'
      ORDER BY ff.submitted_at DESC
    `);

    res.json({ 
      success: true,
      feedback: result.recordset 
    });
  } catch (err) {
    console.error("Get approved feedback error:", err);
    res.status(500).json({ message: "Server error fetching feedback" });
  }
};