const { sql, poolPromise } = require("../config/db");
const { logAudit } = require("../utils/auditLogger");

// ==========================
// Staff Schedule Management
// ==========================
exports.getSchedules = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { date, start_date, end_date, status } = req.query;

    const pool = await poolPromise;
    let query = `
      SELECT 
        schedule_id, work_date, start_time, end_time, status, notes
      FROM StaffSchedule 
      WHERE user_id = @userId
    `;

    const inputs = { userId };
    const conditions = [];

    if (date) {
      conditions.push("work_date = @date");
      inputs.date = date;
    }

    if (start_date) {
      conditions.push("work_date >= @start_date");
      inputs.start_date = start_date;
    }

    if (end_date) {
      conditions.push("work_date <= @end_date");
      inputs.end_date = end_date;
    }

    if (status) {
      conditions.push("status = @status");
      inputs.status = status;
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += " ORDER BY work_date ASC, start_time ASC";

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, key === 'userId' ? sql.Int : sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length
    });

  } catch (err) {
    console.error("Get schedules error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching schedules",
      error: err.message
    });
  }
};

exports.createSchedule = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { work_date, start_time, end_time, status = 'available', notes } = req.body;

    if (!work_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "work_date, start_time, and end_time are required"
      });
    }

    const pool = await poolPromise;

    // Check for overlapping schedules
    const overlapCheck = await pool.request()
      .input('userId', sql.Int, userId)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.VarChar, start_time)
      .input('end_time', sql.VarChar, end_time)
      .query(`
        SELECT schedule_id 
        FROM StaffSchedule 
        WHERE user_id = @userId 
          AND work_date = @work_date
          AND (
            (start_time < @end_time AND end_time > @start_time)
          )
      `);

    if (overlapCheck.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Schedule overlaps with existing time slot"
      });
    }

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.VarChar, start_time)
      .input('end_time', sql.VarChar, end_time)
      .input('status', sql.VarChar, status)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO StaffSchedule (user_id, work_date, start_time, end_time, status, notes)
        OUTPUT INSERTED.schedule_id, INSERTED.work_date, INSERTED.start_time, 
               INSERTED.end_time, INSERTED.status, INSERTED.notes
        VALUES (@userId, @work_date, @start_time, @end_time, @status, @notes)
      `);

    await logAudit(userId, 'CREATE_SCHEDULE', `Created schedule slot for ${work_date}`);

    res.status(201).json({
      success: true,
      message: "Schedule created successfully",
      data: result.recordset[0]
    });

  } catch (err) {
    console.error("Create schedule error:", err);
    res.status(500).json({
      success: false,
      message: "Server error creating schedule",
      error: err.message
    });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    const { work_date, start_time, end_time, status, notes } = req.body;

    const pool = await poolPromise;

    const result = await pool.request()
      .input('scheduleId', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.VarChar, start_time)
      .input('end_time', sql.VarChar, end_time)
      .input('status', sql.VarChar, status)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        UPDATE StaffSchedule 
        SET work_date = @work_date, start_time = @start_time, end_time = @end_time,
            status = @status, notes = @notes
        WHERE schedule_id = @scheduleId AND user_id = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found or access denied"
      });
    }

    await logAudit(userId, 'UPDATE_SCHEDULE', `Updated schedule ${id}`);

    res.json({
      success: true,
      message: "Schedule updated successfully"
    });

  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating schedule",
      error: err.message
    });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    const pool = await poolPromise;

    const result = await pool.request()
      .input('scheduleId', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        DELETE FROM StaffSchedule 
        WHERE schedule_id = @scheduleId AND user_id = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found or access denied"
      });
    }

    await logAudit(userId, 'DELETE_SCHEDULE', `Deleted schedule ${id}`);

    res.json({
      success: true,
      message: "Schedule deleted successfully"
    });

  } catch (err) {
    console.error("Delete schedule error:", err);
    res.status(500).json({
      success: false,
      message: "Server error deleting schedule",
      error: err.message
    });
  }
};

// ==========================
// Appointment Management
// ==========================
exports.getAppointments = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { status, date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    let query = `
      SELECT 
        a.appointment_id, a.date_and_time, a.status, a.notes, a.duration_minutes,
        b.booking_id, b.status as booking_status,
        u.user_id as student_id, u.name as student_name, u.email as student_email, u.phone as student_phone,
        s.service_id, s.name as service_name
      FROM Appointment a
      INNER JOIN Booking b ON a.booking_id = b.booking_id
      INNER JOIN StaffBooking sb ON b.booking_id = sb.booking_id
      INNER JOIN UserAccount u ON b.user_id = u.user_id
      INNER JOIN ServiceType s ON b.service_id = s.service_id
      WHERE sb.staff_id = @userId
    `;

    const inputs = { userId };
    const conditions = [];

    if (status) {
      conditions.push("a.status = @status");
      inputs.status = status;
    }

    if (date) {
      conditions.push("CAST(a.date_and_time AS DATE) = @date");
      inputs.date = date;
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY a.date_and_time DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, key === 'userId' ? sql.Int : sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        count: result.recordset.length
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

exports.updateAppointmentStatus = async (req, res) => {
  let transaction;

  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    const { status, notes, new_date_time } = req.body;

    console.log("🔍 STAFF UPDATE REQUEST:", { id, status, notes, new_date_time, staffId: userId });

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    const validStatuses = ['confirmed', 'cancelled', 'completed', 'rescheduled', 'pending'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: confirmed, cancelled, completed, rescheduled, or pending"
      });
    }

    if (status.toLowerCase() === 'rescheduled' && !new_date_time) {
      return res.status(400).json({
        success: false,
        message: "new_date_time is required for reschedule action"
      });
    }

    const pool = await poolPromise;
    
    // FIRST: Verify staff access and get appointment data
    console.log("🔍 DEBUG: Checking staff access and appointment data...");
    const debugResult = await pool.request()
      .input('appointmentId', sql.Int, id)
      .input('staffId', sql.Int, userId)
      .query(`
        SELECT 
          a.appointment_id,
          a.booking_id,
          a.date_and_time,
          a.status,
          b.booking_id as booking_id_from_join,
          b.user_id,
          b.status as booking_status,
          u.email,
          u.phone,
          u.name AS user_name
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        INNER JOIN StaffBooking sb ON b.booking_id = sb.booking_id
        LEFT JOIN UserAccount u ON b.user_id = u.user_id
        WHERE a.appointment_id = @appointmentId AND sb.staff_id = @staffId
      `);

    console.log("🔍 DEBUG RESULT:", {
      recordCount: debugResult.recordset.length,
      data: debugResult.recordset[0]
    });

    if (debugResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or access denied"
      });
    }

    const debugData = debugResult.recordset[0];
    const bookingId = debugData.booking_id;
    const bookingIdFromJoin = debugData.booking_id_from_join;

    console.log("🔍 BOOKING ID ANALYSIS:", {
      bookingId: bookingId,
      bookingIdType: typeof bookingId,
      bookingIdFromJoin: bookingIdFromJoin,
      bookingIdFromJoinType: typeof bookingIdFromJoin,
      isBookingIdValid: bookingId && !isNaN(bookingId),
      isBookingIdFromJoinValid: bookingIdFromJoin && !isNaN(bookingIdFromJoin)
    });

    // Use whichever booking_id is valid
    const validBookingId = bookingId && !isNaN(bookingId) ? bookingId : 
                          bookingIdFromJoin && !isNaN(bookingIdFromJoin) ? bookingIdFromJoin : null;

    console.log("🔍 USING BOOKING ID:", validBookingId);

    if (!validBookingId) {
      return res.status(500).json({
        success: false,
        message: "No valid booking ID found for this appointment"
      });
    }

    // Now start the transaction
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const appointment = debugData;
    const oldStatus = appointment.status;
    const patientUserId = appointment.user_id;

    // 1. Update Appointment
    if (status.toLowerCase() === 'rescheduled') {
      await transaction.request()
        .input("appointmentId", sql.Int, id)
        .input("status", sql.VarChar, status)
        .input("date_and_time", sql.DateTime, new_date_time)
        .input("notes", sql.NVarChar, notes || null)
        .query(`
          UPDATE Appointment
          SET status = @status, 
              date_and_time = @date_and_time, 
              notes = COALESCE(@notes, notes)
          WHERE appointment_id = @appointmentId
        `);
    } else {
      await transaction.request()
        .input("appointmentId", sql.Int, id)
        .input("status", sql.VarChar, status)
        .input("notes", sql.NVarChar, notes || null)
        .query(`
          UPDATE Appointment
          SET status = @status, 
              notes = COALESCE(@notes, notes)
          WHERE appointment_id = @appointmentId
        `);
    }

    // 2. Update Booking table (synchronization)
    console.log("🔍 UPDATING BOOKING TABLE...");
    const bookingUpdateResult = await transaction.request()
      .input("bookingId", sql.Int, validBookingId)
      .input("status", sql.VarChar, status)
      .query(`
        UPDATE Booking
        SET status = @status
        WHERE booking_id = @bookingId
      `);

    console.log("🔍 BOOKING UPDATE SUCCESS:", bookingUpdateResult.rowsAffected);

    // 3. Create notification message
    const formattedDate = new Date(
      status.toLowerCase() === 'rescheduled' ? new_date_time : appointment.date_and_time
    ).toLocaleString();
    
    let messageContent = '';
    let emailSubject = '';
    let emailBody = '';

    switch (status.toLowerCase()) {
      case 'confirmed':
        messageContent = `✅ CONFIRMED: Your appointment on ${formattedDate} has been confirmed.`;
        emailSubject = 'Appointment Confirmed';
        emailBody = `Hello ${appointment.user_name},<br><br>Your appointment has been confirmed for ${formattedDate}.<br><br>Thank you,<br>Healthcare Team`;
        break;
      case 'cancelled':
        messageContent = `❌ CANCELLED: Your appointment on ${formattedDate} has been cancelled.`;
        emailSubject = 'Appointment Cancelled';
        emailBody = `Hello ${appointment.user_name},<br><br>Your appointment scheduled for ${formattedDate} has been cancelled.${notes ? `<br><br>Notes: ${notes}` : ''}`;
        break;
      case 'completed':
        messageContent = `🎉 COMPLETED: Your appointment on ${formattedDate} is complete.`;
        emailSubject = 'Appointment Completed';
        emailBody = `Hello ${appointment.user_name},<br><br>Your appointment on ${formattedDate} has been completed. Thank you for visiting!`;
        break;
      case 'rescheduled':
        messageContent = `📅 RESCHEDULED: Your appointment has been rescheduled to ${formattedDate}.`;
        emailSubject = 'Appointment Rescheduled';
        emailBody = `Hello ${appointment.user_name},<br><br>Your appointment has been rescheduled to ${formattedDate}.${notes ? `<br><br>Notes: ${notes}` : ''}`;
        break;
      default:
        messageContent = `Your appointment status has been updated to: ${status}`;
        emailSubject = `Appointment Status Updated`;
        emailBody = `Hello ${appointment.user_name},<br><br>Your appointment status has been updated to: ${status}.`;
    }

    // 4. Insert Notification for the patient
    if (patientUserId) {
      await transaction.request()
        .input("userId", sql.Int, patientUserId)
        .input("appointmentId", sql.Int, id)
        .input("content", sql.NVarChar, messageContent)
        .input("type", sql.VarChar, "appointment_status")
        .input("status", sql.VarChar, "unread")
        .input("sent_at", sql.DateTime, new Date())
        .query(`
          INSERT INTO Notification (user_id, appointment_id, content, type, status, sent_at)
          VALUES (@userId, @appointmentId, @content, @type, @status, @sent_at)
        `);
    }

    // 5. Log audit trail
    await transaction.request()
      .input("userId", sql.Int, userId)
      .input("action", sql.VarChar, 'UPDATE_APPOINTMENT_STATUS')
      .input("description", sql.NVarChar, `Staff updated appointment ${id} from ${oldStatus} to ${status}`)
      .input("timestamp", sql.DateTime, new Date())
      .query(`
        INSERT INTO AuditLog (user_id, action, description, timestamp)
        VALUES (@userId, @action, @description, @timestamp)
      `);

    await transaction.commit();

    console.log("✅ STAFF TRANSACTION COMMITTED SUCCESSFULLY");

    // 6. Send notifications (optional - same as admin)
    const notificationResults = {};
    const allowedStatuses = ["confirmed", "cancelled", "completed", "rescheduled"];

    if (allowedStatuses.includes(status.toLowerCase()) && appointment.phone && oldStatus !== status) {
      try {
        await sendSMSNotification(appointment.phone, messageContent, patientUserId);
        notificationResults.sms = { success: true };
      } catch (smsError) {
        console.error("❌ SMS sending failed:", smsError.message);
        notificationResults.sms = { success: false, error: smsError.message };
      }
    }

    if (allowedStatuses.includes(status.toLowerCase()) && appointment.email && oldStatus !== status) {
      try {
        await sendEmailNotification.sendEmail(
          appointment.email,
          emailSubject,
          emailBody.replace(/<br>/g, '\n'),
          emailBody
        );
        notificationResults.email = { success: true };
      } catch (emailError) {
        console.error("❌ Email sending failed:", emailError.message);
        notificationResults.email = { success: false, error: emailError.message };
      }
    }

    res.json({
      success: true,
      message: "Appointment and booking status updated successfully",
      data: {
        appointmentId: id,
        bookingId: validBookingId,
        newStatus: status,
        oldStatus,
        updatedByStaff: userId,
        notifications: notificationResults
      }
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("❌ Staff update appointment status error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating appointment status",
      error: err.message
    });
  }
};

// ==========================
// Booking Management
// ==========================
exports.getBookings = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    let query = `
      SELECT 
        b.booking_id, b.status, b.requested_time_date, b.created_at,
        u.user_id, u.name as student_name, u.email as student_email,
        s.service_id, s.name as service_name
      FROM Booking b
      INNER JOIN UserAccount u ON b.user_id = u.user_id
      INNER JOIN ServiceType s ON b.service_id = s.service_id
      WHERE b.status = 'pending'
      ORDER BY b.created_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;

    const result = await pool.request().query(query);

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        count: result.recordset.length
      }
    });

  } catch (err) {
    console.error("Get bookings error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching bookings",
      error: err.message
    });
  }
};

exports.manageBooking = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;
    const { action, notes } = req.body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Valid action (approve/reject) is required"
      });
    }

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Get booking details
      const bookingResult = await transaction.request()
        .input('bookingId', sql.Int, id)
        .query(`
          SELECT booking_id, user_id, status, requested_time_date
          FROM Booking 
          WHERE booking_id = @bookingId AND status = 'pending'
        `);

      if (bookingResult.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Booking not found or already processed"
        });
      }

      const booking = bookingResult.recordset[0];
      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      // Update booking status
      await transaction.request()
        .input('bookingId', sql.Int, id)
        .input('status', sql.VarChar, newStatus)
        .input('processedAt', sql.DateTime, new Date())
        .query(`
          UPDATE Booking 
          SET status = @status, processed_at = @processedAt
          WHERE booking_id = @bookingId
        `);

      if (action === 'approve') {
        // Link staff to booking
        await transaction.request()
          .input('bookingId', sql.Int, id)
          .input('staffId', sql.Int, userId)
          .query(`
            INSERT INTO StaffBooking (booking_id, staff_id)
            VALUES (@bookingId, @staffId)
          `);

        // Create appointment
        await transaction.request()
          .input('bookingId', sql.Int, id)
          .input('dateTime', sql.DateTime, booking.requested_time_date)
          .input('status', sql.VarChar, 'scheduled')
          .input('notes', sql.NVarChar, notes || null)
          .query(`
            INSERT INTO Appointment (booking_id, date_and_time, status, notes)
            VALUES (@bookingId, @dateTime, @status, @notes)
          `);
      }

      // Create notification
      await transaction.request()
        .input('userId', sql.Int, booking.user_id)
        .input('content', sql.NVarChar, `Your booking has been ${newStatus}.`)
        .input('type', sql.VarChar, 'booking_update')
        .input('status', sql.VarChar, 'unread')
        .query(`
          INSERT INTO Notification (user_id, content, type, status, sent_at)
          VALUES (@userId, @content, @type, @status, GETDATE())
        `);

      await transaction.commit();
      await logAudit(userId, 'MANAGE_BOOKING', `${action} booking ${id}`);

      res.json({
        success: true,
        message: `Booking ${action}ed successfully`
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (err) {
    console.error("Manage booking error:", err);
    res.status(500).json({
      success: false,
      message: "Server error managing booking",
      error: err.message
    });
  }
};

// ==========================
// Student Management
// ==========================
exports.getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    let query = `
      SELECT 
        u.user_id, u.name, u.email, u.phone, u.created_at,
        s.student_number
      FROM UserAccount u
      INNER JOIN Student s ON u.user_id = s.user_id
      WHERE u.role = 'student'
    `;

    const inputs = {};
    
    if (search) {
      query += ` AND (u.name LIKE @search OR u.email LIKE @search OR s.student_number LIKE @search)`;
      inputs.search = `%${search}%`;
    }

    query += ` ORDER BY u.name OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        count: result.recordset.length
      }
    });

  } catch (err) {
    console.error("Get students error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching students",
      error: err.message
    });
  }
};

exports.getStudentProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;

    const studentResult = await pool.request()
      .input('studentId', sql.Int, id)
      .query(`
        SELECT 
          u.user_id, u.name, u.email, u.phone, u.created_at,
          s.student_number
        FROM UserAccount u
        INNER JOIN Student s ON u.user_id = s.user_id
        WHERE u.user_id = @studentId AND u.role = 'student'
      `);

    if (studentResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    const appointmentsResult = await pool.request()
      .input('studentId', sql.Int, id)
      .query(`
        SELECT 
          a.appointment_id, a.date_and_time, a.status, a.notes,
          b.booking_id, b.status as booking_status,
          s.name as service_name
        FROM Booking b
        INNER JOIN Appointment a ON b.booking_id = a.booking_id
        INNER JOIN ServiceType s ON b.service_id = s.service_id
        WHERE b.user_id = @studentId
        ORDER BY a.date_and_time DESC
      `);

    res.json({
      success: true,
      data: {
        student: studentResult.recordset[0],
        appointments: appointmentsResult.recordset
      }
    });

  } catch (err) {
    console.error("Get student profile error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching student profile",
      error: err.message
    });
  }
};



// Placeholder for other methods - adapt your existing business logic
exports.getAvailability = exports.getSchedules; // Alias for compatibility
exports.addAvailability = exports.createSchedule; // Alias for compatibility
exports.updateAvailability = exports.updateSchedule; // Alias for compatibility
exports.deleteAvailability = exports.deleteSchedule; // Alias for compatibility

exports.getAppointmentHistory = exports.getAppointments; // Alias for compatibility
exports.searchAppointments = async (req, res) => { /* Your search logic */ };
exports.completeAppointment = async (req, res) => { /* Your completion logic */ };
exports.getAppointmentNotes = async (req, res) => { /* Your notes logic */ };
exports.addAppointmentNote = async (req, res) => { /* Your add note logic */ };
exports.getStudentAppointments = async (req, res) => { /* Your student appointments logic */ };