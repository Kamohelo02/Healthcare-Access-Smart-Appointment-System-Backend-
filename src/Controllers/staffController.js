const {sql, poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { loginValidator } = require('../utils/validators');
const { getUserByEmail } = require('../models/UserAccount');
const { logAudit } = require('../utils/auditLogger');
const twilioClient = require('../config/twilio');

// ====	/staff/login — POST====
exports.loginStaff = async (req, res) => {
  const { error } = loginValidator.validate(req.body);
  if (error) {
    await logAudit(null, 'login_attempt', 'failed', error.message);
    return res.status(400).json({ error: error.details[0].message });
  }

  const { email, password } = req.body;

  try {
    const user = await getUserByEmail(email);

    // Check if user exists and is a staff member
    if (!user || user.role !== 'staff') {
      await logAudit(null, 'login_attempt', 'failed', 'Invalid credentials');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Ensure password hash is available
    if (!user.password_hash) {
      return res.status(500).json({ error: 'Password hash missing for user' });
    }

    // Compare plain password with hashed password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAudit(user.user_id, 'login_attempt', 'failed', 'Incorrect password');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Log successful login
    await logAudit(user.user_id, 'login_attempt', 'success', 'Login successful');

    // Return structured JSON response
    res.status(200).json({
      message: 'Login successful',
      token,
      staff: {
        id: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        position: user.position,
        is_admin: Boolean(user.is_admin),
        account_status: Boolean(user.account_status)
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

 //==== /schedule — GET ===
exports.getSchedule = async (req, res) => {
  const staffId = req.user.user_id; // Injected by JWT middleware
  const { day, from_date, to_date, date, status, from, to } = req.query;

  try {
    const pool = await poolPromise;

    // Fetch recurring weekly schedule
    let scheduleQuery = `
      SELECT schedule_id, day_of_the_week, start_time, end_time, is_recurring
      FROM Schedule
      WHERE user_id = @staffId
    `;
    if (day) scheduleQuery += ` AND day_of_the_week = @day`;

    const scheduleRequest = pool.request().input('staffId', staffId);
    if (day) scheduleRequest.input('day', day);

    const scheduleResult = await scheduleRequest.query(scheduleQuery);
    const weeklySchedule = scheduleResult.recordset;

    // Fetch specific time slots with filters
    let slotQuery = `
      SELECT slot_id, date, start_time, end_time, status
      FROM TimeSlot
      WHERE user_id = @staffId
    `;
    if (date) slotQuery += ` AND date = @date`;
    if (from_date) slotQuery += ` AND date >= @from_date`;
    if (to_date) slotQuery += ` AND date <= @to_date`;
    if (status) slotQuery += ` AND status = @status`;
    if (from) slotQuery += ` AND start_time >= @from`;
    if (to) slotQuery += ` AND end_time <= @to`;

    const slotRequest = pool.request().input('staffId', staffId);
    if (date) slotRequest.input('date', date);
    if (from_date) slotRequest.input('from_date', from_date);
    if (to_date) slotRequest.input('to_date', to_date);
    if (status) slotRequest.input('status', status);
    if (from) slotRequest.input('from', from);
    if (to) slotRequest.input('to', to);

    const slotResult = await slotRequest.query(slotQuery);
    const timeSlots = slotResult.recordset;

    // Detect overlapping time slots
    const conflicts = [];
    for (let i = 0; i < timeSlots.length; i++) {
      for (let j = i + 1; j < timeSlots.length; j++) {
        const a = timeSlots[i];
        const b = timeSlots[j];
        if (
          a.date === b.date &&
          a.start_time < b.end_time &&
          b.start_time < a.end_time
        ) {
          conflicts.push({ slot1: a, slot2: b });
        }
      }
    }

    // Format output
    const formattedSchedule = weeklySchedule.map(s => ({
      type: 'recurring',
      day: s.day_of_the_week,
      start: s.start_time,
      end: s.end_time,
      recurring: Boolean(s.is_recurring)
    }));

    const formattedSlots = timeSlots.map(ts => ({
      type: 'specific',
      date: ts.date,
      start: ts.start_time,
      end: ts.end_time,
      status: ts.status
    }));

    res.status(200).json({
      staff_id: staffId,
      filters: { day, from_date, to_date, date, status, from, to },
      schedule: [...formattedSchedule, ...formattedSlots],
      conflicts
    });
  } catch (err) {
    console.error('Schedule error:', err);
    res.status(500).json({ error: 'Failed to retrieve schedule' });
  }
};

// ==== /availability — POST, GET ===
// get availability
exports.getAvailability = async (req, res) => {
  const userId = req.staff?.user_id;

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input('user_id', userId)
      .query(`
        SELECT slot_id, date, start_time, end_time, status
        FROM TimeSlot
        WHERE user_id = @user_id
        ORDER BY date ASC, start_time ASC
      `);

    const formatted = result.recordset.map(slot => ({
      slot_id: slot.slot_id,
      date: slot.date.toISOString().split('T')[0],
      start_time: new Date(slot.start_time).toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      end_time: new Date(slot.end_time).toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      status: slot.status
    }));

    res.status(200).json({ availability: formatted });
  } catch (err) {
    console.error('Get availability error:', err);
    res.status(500).json({ message: 'Failed to fetch availability' });
  }
};

// add availability
exports.addAvailability = async (req, res) => {
  try {
    const staffUserId = req.staff.user_id; // from JWT
    const { date, start_time, end_time, status } = req.body;

    //  time validation
    if (!date || !start_time || !end_time) {
      return res.status(400).json({ error: 'date, start_time, and end_time are required' });
    }

    const startDateTime = new Date(`${date}T${start_time}`);
    const endDateTime = new Date(`${date}T${end_time}`);

    if (isNaN(startDateTime) || isNaN(endDateTime)) {
      return res.status(400).json({ error: 'Invalid date or time format' });
    }

    if (startDateTime >= endDateTime) {
      return res.status(400).json({ error: 'start_time must be before end_time' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDateTime < today) {
      return res.status(400).json({ error: 'Cannot add availability in the past' });
    }

    const pool = await poolPromise;

    // Check for overlapping slots
    const overlapCheck = await pool.request()
      .input('user_id', sql.Int, staffUserId)
      .input('date', sql.Date, date)
      .input('start_time', sql.DateTime, startDateTime)
      .input('end_time', sql.DateTime, endDateTime)
      .query(`
        SELECT *
        FROM TimeSlot
        WHERE user_id = @user_id
          AND date = @date
          AND (
            (start_time < @end_time AND end_time > @start_time)
          )
      `);

    if (overlapCheck.recordset.length > 0) {
      return res.status(409).json({ error: 'Time slot overlaps with an existing slot' });
    }

    // Insert new slot
    const insertResult = await pool.request()
      .input('user_id', sql.Int, staffUserId)
      .input('date', sql.Date, date)
      .input('start_time', sql.DateTime, startDateTime)
      .input('end_time', sql.DateTime, endDateTime)
      .input('status', sql.VarChar(50), status || 'Available')
      .query(`
        INSERT INTO TimeSlot (user_id, date, start_time, end_time, status)
        OUTPUT INSERTED.slot_id, INSERTED.date, 
               FORMAT(INSERTED.start_time, 'HH:mm') AS start_time,
               FORMAT(INSERTED.end_time, 'HH:mm') AS end_time,
               INSERTED.status
        VALUES (@user_id, @date, @start_time, @end_time, @status)
      `);

    // Return success JSON
    res.status(201).json({
      message: 'Availability added successfully',
      slot: insertResult.recordset[0]
    });

  } catch (err) {
    console.error('Error adding availability:', err);
    res.status(500).json({ error: 'Failed to add availability', details: err.message });
  }
};

//===== /appointments/manage — PUT =====
exports.manageAppointment = async (req, res) => {
    const staffId = req.staff.user_id; // from authMiddleware
    const { booking_id, action, notes } = req.body; // action = 'approve' or 'reject'

    if (!booking_id || !action) {
        await logAudit(staffId, 'manage_appointment', 'Missing booking_id or action');
        return res.status(400).json({
            success: false,
            message: 'booking_id and action are required'
        });
    }

    if (!['approve', 'reject'].includes(action.toLowerCase())) {
        await logAudit(staffId, 'manage_appointment', `Invalid action: ${action}`);
        return res.status(400).json({
            success: false,
            message: 'Invalid action. Must be approve or reject'
        });
    }

    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        //  Get booking details
        const bookingCheck = await transaction.request()
            .input('booking_id', sql.Int, booking_id)
            .query(`
                 SELECT booking_id, user_id, status, requested_time_date
                 FROM Booking
                 WHERE booking_id = @booking_id
            `);

        if (bookingCheck.recordset.length === 0) {
            await logAudit(staffId, 'manage_appointment', `Booking ID ${booking_id} not found`);
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        const booking = bookingCheck.recordset[0];

        // Prevent re-processing
        if (booking.status !== 'requested') {
            await logAudit(staffId, 'manage_appointment', `Booking ID ${booking_id} already ${booking.status}`);
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `Booking already ${booking.status}`
            });
        }

        let appointmentId = null;

        if (action.toLowerCase() === 'approve') {
            // Update booking status
            await transaction.request()
                .input('booking_id', sql.Int, booking_id)
                .input('status', sql.VarChar, 'approved')
                .input('processed_at', sql.DateTime, new Date())
                .query(`
                    UPDATE Booking
                    SET status = @status, processed_at = @processed_at
                    WHERE booking_id = @booking_id
                `);
            
            // Insert into StaffBooking to link booking to staff
            await transaction.request()
               .input('booking_id', sql.Int, booking_id)
               .input('staff_id', sql.Int, staffId)
               .query(`
                     INSERT INTO StaffBooking (booking_id, staff_id)
                     VALUES (@booking_id, @staff_id)
                `);

            // Create appointment
            const appointmentInsert = await transaction.request()
              .input('booking_id', sql.Int, booking_id)
              .input('date_and_time', sql.Time, booking.requested_time_date)
              .input('status', sql.VarChar, 'pending')
              .input('notes', sql.VarChar, notes || null)
              .query(`
                  INSERT INTO Appointment (booking_id, date_and_time, status, notes)
                  OUTPUT INSERTED.appointment_id
                  VALUES (@booking_id, @date_and_time, @status, @notes)
                `);
            appointmentId = appointmentInsert.recordset[0].appointment_id;

            // Create notification for student
            await transaction.request()
                .input('appointment_id', sql.Int, appointmentId)
                .input('user_id', sql.Int, booking.user_id) // student
                .input('content', sql.VarChar, 'Your appointment has been approved.')
                .input('status', sql.VarChar, 'unread')
                .input('type', sql.VarChar, 'booking_update')
                .input('sent_at', sql.DateTime, new Date())
                .query(`
                    INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
                    VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)
                `);

            await logAudit(staffId, 'manage_appointment', `Approved booking ID ${booking_id}, created appointment ID ${appointmentId}`);

        } else if (action.toLowerCase() === 'reject') {
            // Update booking status
            await transaction.request()
                .input('booking_id', sql.Int, booking_id)
                .input('status', sql.VarChar, 'rejected')
                .input('processed_at', sql.DateTime, new Date())
                .query(`
                    UPDATE Booking
                    SET status = @status, processed_at = @processed_at
                    WHERE booking_id = @booking_id
                `);

            //  Create notification for student
            await transaction.request()
                .input('appointment_id', sql.Int, null) // no appointment
                .input('user_id', sql.Int, booking.user_id)
                .input('content', sql.VarChar, 'Your booking request has been rejected.')
                .input('status', sql.VarChar, 'unread')
                .input('type', sql.VarChar, 'booking_update')
                .input('sent_at', sql.DateTime, new Date())
                .query(`
                    INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
                    VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)
                `);

            await logAudit(staffId, 'manage_appointment', `Rejected booking ID ${booking_id}`);
        }

        await transaction.commit();
        await logAudit(staffId, 'manage_appointment', `Transaction committed for booking ID ${booking_id}`);

        return res.status(200).json({
            success: true,
            message: `Booking ${action.toLowerCase()}d successfully`,
            appointment_id: appointmentId || null
        });

    } catch (error) {
        console.error('Error managing appointment:', error);
        await logAudit(staffId, 'manage_appointment', `Server error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Server error while managing appointment'
        });
    }
};

//====== /appointments/history — GET =====
exports.getAppointmentHistory = async (req, res) => {
    const staffId = req.staff.user_id; // from authMiddleware

    try {
        const pool = await poolPromise;
        const result = await pool.request()
             .input('staffId', sql.Int, staffId)
             .query(`
                   SELECT a.appointment_id,
                          a.date_and_time,
                          a.status,
                          a.notes,
                          b.user_id AS student_id,
                          ua.name AS student_name
                   FROM Appointment a
                   INNER JOIN Booking b ON a.booking_id = b.booking_id
                   INNER JOIN StaffBooking sb ON b.booking_id = sb.booking_id
                   INNER JOIN UserAccount ua ON b.user_id = ua.user_id
                   WHERE sb.staff_id = @staffId
                     AND a.status IN ('pending', 'completed', 'cancelled', 'rejected')
                   ORDER BY a.date_and_time DESC
              `);

        res.status(200).json({
            success: true,
            data: result.recordset,
            message: 'Appointment history retrieved successfully'
        });
    } catch (error) {
        console.error('Error fetching appointment history:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching appointment history'
        });
    }
};

// ==== /student/:id — GET ====
exports.getStudentProfile = async (req, res) => {
  const studentUserId = req.params.id;

  try {
    const pool = await poolPromise;

    // Get student profile
    const studentResult = await pool.request()
      .input('user_id', studentUserId)
      .query(`
        SELECT s.student_number, ua.name, ua.email, ua.phone, ua.create_at
        FROM Student s
        JOIN UserAccount ua ON s.user_id = ua.user_id
        WHERE s.user_id = @user_id
      `);

    const student = studentResult.recordset[0];
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Get appointment history via Booking
    const historyResult = await pool.request()
      .input('user_id', studentUserId)
      .query(`
        SELECT 
          a.appointment_id,
          a.date_and_time,
          a.status,
          a.notes,
          b.booking_id,
          b.status AS booking_status,
          b.requested_time_date,
          b.created_at,
          b.processed_at
        FROM Booking b
        JOIN Appointment a ON b.booking_id = a.booking_id
        WHERE b.user_id = @user_id
        ORDER BY a.date_and_time DESC
      `);

    res.status(200).json({
      student,
      appointment_history: historyResult.recordset
    });
  } catch (err) {
    console.error('Student profile error:', err);
    res.status(500).json({ message: 'Failed to fetch student profile' });
  }
};

// =====  /messages/send — POST ====
exports.sendMessage = async (req, res) => {
  const staffId = req.staff?.user_id;
  const { student_id, content } = req.body;

  // Validate input
  if (!student_id || !content) {
    await logAudit(staffId, 'send_message', 'Missing student_id or content');
    return res.status(400).json({ success: false, message: 'student_id and content are required' });
  }

  try {
    const pool = await poolPromise;

    // Fetch student phone number
    const studentQuery = await pool.request()
      .input('student_id', sql.Int, student_id)
      .query(`SELECT phone FROM UserAccount WHERE user_id = @student_id AND role = 'student'`);

    if (studentQuery.recordset.length === 0) {
      await logAudit(staffId, 'send_message', `Student ID ${student_id} not found`);
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const studentPhone = studentQuery.recordset[0].phone;

    // Send SMS via Twilio
    let smsResponse;
    try {
      smsResponse = await twilioClient.messages.create({
        body: content,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: studentPhone
      });
    } catch (twilioError) {
      console.error('Twilio error:', twilioError);
      await logAudit(staffId, 'send_message', `Twilio failed: ${twilioError.message}`);
      return res.status(502).json({ success: false, message: 'Failed to send SMS via Twilio' });
    }

    // Insert notification into DB
    await pool.request()
      .input('appointment_id', sql.Int, null)
      .input('user_id', sql.Int, student_id)
      .input('content', sql.VarChar, content)
      .input('status', sql.VarChar, 'sent')
      .input('type', sql.VarChar, 'manual_message')
      .input('sent_at', sql.DateTime, new Date())
      .query(`
        INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
        VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)
      `);

    // Log audit
    await logAudit(staffId, 'send_message', `Message sent to student ID ${student_id}`);

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      sid: smsResponse.sid
    });

  } catch (error) {
    console.error('Send message error:', error);
    await logAudit(staffId, 'send_message', `Server error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ====== /appointments/complete — PUT ====
exports.markAppointmentComplete = async (req, res) => {
  const { appointment_id, notes } = req.body;

  try {
    const pool = await poolPromise;

    // Validate appointment exists
    const result = await pool.request()
      .input('appointment_id', appointment_id)
      .query(`
        SELECT appointment_id
        FROM Appointment
        WHERE appointment_id = @appointment_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Update status and notes
    await pool.request()
      .input('appointment_id', appointment_id)
      .input('notes', notes)
      .query(`
        UPDATE Appointment
        SET status = 'completed', notes = @notes
        WHERE appointment_id = @appointment_id
      `);

    res.status(200).json({ message: 'Appointment marked as completed' });
  } catch (err) {
    console.error('Complete appointment error:', err);
    res.status(500).json({ message: 'Failed to complete appointment' });
  }
};



