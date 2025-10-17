const {sql, poolPromise } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { loginValidator } = require('../utils/validators');
const { logAudit } = require('../utils/auditLogger');
const sendEmailNotification = require("../Utils/sendEmailNotification");
const twilio = require('twilio');




// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID, 
  process.env.TWILIO_AUTH_TOKEN
);



 //===================
 //Sechedule mangement
 //====================
exports.getSchedule = async (req, res) => {
  const staffId = req.staff.user_id; //From Middleware
  const { from_date, to_date, date, status, from, to } = req.query;

  try {
    const pool = await poolPromise;

    // Build query dynamically against StaffSchedule
    let scheduleQuery = `
      SELECT schedule_id, work_date, start_time, end_time, status, notes
      FROM StaffSchedule
      WHERE user_id = @staffId
    `;

    if (date) scheduleQuery += ` AND work_date = @date`;
    if (from_date) scheduleQuery += ` AND work_date >= @from_date`;
    if (to_date) scheduleQuery += ` AND work_date <= @to_date`;
    if (status) scheduleQuery += ` AND status = @status`;
    if (from) scheduleQuery += ` AND start_time >= @from`;
    if (to) scheduleQuery += ` AND end_time <= @to`;

    const request = pool.request().input('staffId', staffId);
    if (date) request.input('date', date);
    if (from_date) request.input('from_date', from_date);
    if (to_date) request.input('to_date', to_date);
    if (status) request.input('status', status);
    if (from) request.input('from', from);
    if (to) request.input('to', to);

    const result = await request.query(scheduleQuery);
    const schedules = result.recordset;

    // Detect overlapping slots
    const conflicts = [];
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i];
        const b = schedules[j];
        if (
          a.work_date.getTime() === b.work_date.getTime() &&
          a.start_time < b.end_time &&
          b.start_time < a.end_time
        ) {
          conflicts.push({ slot1: a, slot2: b });
        }
      }
    }

    // Format output
    const formatted = schedules.map(s => ({
      schedule_id: s.schedule_id,
      date: s.work_date,
      start: s.start_time,
      end: s.end_time,
      status: s.status,
      notes: s.notes
    }));

    res.status(200).json({
      staff_id: staffId,
      filters: { from_date, to_date, date, status, from, to },
      schedule: formatted,
      conflicts
    });
  } catch (err) {
    console.error('Schedule error:', err);
    res.status(500).json({ error: 'Failed to retrieve schedule' });
  }
};

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
        SELECT 
          schedule_id,
          work_date,
          start_time,   -- stored as varchar(8) like '09:00'
          end_time,     -- stored as varchar(8) like '10:00'
          status,
          notes
        FROM StaffSchedule
        WHERE user_id = @user_id
        ORDER BY work_date ASC, start_time ASC
      `);

    const formatted = result.recordset.map(slot => ({
      schedule_id: slot.schedule_id,
      date: slot.work_date.toISOString().split('T')[0],
      start_time: slot.start_time?.substring(0,5), // ensure "HH:mm"
      end_time: slot.end_time?.substring(0,5),
      status: slot.status,
      notes: slot.notes
    }));

    res.status(200).json({ availability: formatted });
  } catch (err) {
    console.error('Get availability error:', err);
    res.status(500).json({ message: 'Failed to fetch availability' });
  }
};

exports.addAvailability = async (req, res) => {
  try {
    const staffUserId = req.staff.user_id; // from JWT
    const { date, start_time, end_time, status, notes } = req.body;

    // Basic validation
    if (!date || !start_time || !end_time) {
      return res.status(400).json({ error: 'date, start_time, and end_time are required' });
    }

    // Convert to Date objects for validation
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

    // Overlap check using CAST to TIME
    const overlapCheck = await pool.request()
      .input('user_id', sql.Int, staffUserId)
      .input('work_date', sql.Date, date)
      .input('start_time', sql.VarChar(8), start_time)
      .input('end_time', sql.VarChar(8), end_time)
      .query(`
        SELECT *
        FROM StaffSchedule
        WHERE user_id = @user_id
          AND work_date = @work_date
          AND (
            (CAST(start_time AS TIME) < CAST(@end_time AS TIME)
             AND CAST(end_time AS TIME) > CAST(@start_time AS TIME))
          )
      `);

    if (overlapCheck.recordset.length > 0) {
      return res.status(409).json({ error: 'Time slot overlaps with an existing slot' });
    }

    // Insert new slot
    const insertResult = await pool.request()
      .input('user_id', sql.Int, staffUserId)
      .input('work_date', sql.Date, date)
      .input('start_time', sql.VarChar(8), start_time)
      .input('end_time', sql.VarChar(8), end_time)
      .input('status', sql.VarChar(50), status || 'Available')
      .input('notes', sql.NVarChar(500), notes || null)
      .query(`
        INSERT INTO StaffSchedule (user_id, work_date, start_time, end_time, status, notes)
        OUTPUT INSERTED.schedule_id, INSERTED.work_date, 
               INSERTED.start_time, INSERTED.end_time,
               INSERTED.status, INSERTED.notes
        VALUES (@user_id, @work_date, @start_time, @end_time, @status, @notes)
      `);

    res.status(201).json({
      message: 'Availability added successfully',
      slot: insertResult.recordset[0]
    });

  } catch (err) {
    console.error('Error adding availability:', err);
    res.status(500).json({ error: 'Failed to add availability', details: err.message });
  }
};

exports.editAvailability = async (req, res) => {
  try {
    const staffUserId = req.staff.user_id; // from JWT
    const { id } = req.params;             // schedule_id
    const { date, start_time, end_time, status, notes } = req.body;

    if (!date || !start_time || !end_time) {
      return res.status(400).json({ error: 'date, start_time, and end_time are required' });
    }

    // Validate times
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
      return res.status(400).json({ error: 'Cannot set availability in the past' });
    }

    const pool = await poolPromise;

    // Overlap check (excluding the current slot itself)
    const overlapCheck = await pool.request()
      .input('user_id', sql.Int, staffUserId)
      .input('work_date', sql.Date, date)
      .input('start_time', sql.VarChar(8), start_time)
      .input('end_time', sql.VarChar(8), end_time)
      .input('schedule_id', sql.Int, id)
      .query(`
        SELECT *
        FROM StaffSchedule
        WHERE user_id = @user_id
          AND work_date = @work_date
          AND schedule_id <> @schedule_id
          AND (
            (CAST(start_time AS TIME) < CAST(@end_time AS TIME)
             AND CAST(end_time AS TIME) > CAST(@start_time AS TIME))
          )
      `);

    if (overlapCheck.recordset.length > 0) {
      return res.status(409).json({ error: 'Time slot overlaps with an existing slot' });
    }

    // Update the slot
    const updateResult = await pool.request()
      .input('schedule_id', sql.Int, id)
      .input('user_id', sql.Int, staffUserId)
      .input('work_date', sql.Date, date)
      .input('start_time', sql.VarChar(8), start_time)
      .input('end_time', sql.VarChar(8), end_time)
      .input('status', sql.VarChar(50), status || 'Available')
      .input('notes', sql.NVarChar(500), notes || null)
      .query(`
        UPDATE StaffSchedule
        SET work_date = @work_date,
            start_time = @start_time,
            end_time = @end_time,
            status = @status,
            notes = @notes
        OUTPUT INSERTED.schedule_id, INSERTED.work_date,
               INSERTED.start_time, INSERTED.end_time,
               INSERTED.status, INSERTED.notes
        WHERE schedule_id = @schedule_id AND user_id = @user_id
      `);

    if (updateResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Slot not found or not owned by this staff member' });
    }

    res.status(200).json({
      message: 'Availability updated successfully',
      slot: updateResult.recordset[0]
    });

  } catch (err) {
    console.error('Error editing availability:', err);
    res.status(500).json({ error: 'Failed to edit availability', details: err.message });
  }
};

//=======================
//Appointments management 
//========================
exports.manageAppointment = async (req, res) => {
  const staffId = req.staff.user_id;
  const { booking_id, action, notes, new_date_time, duration_minutes } = req.body;

  if (!booking_id || !action) {
    await logAudit(staffId, 'manage_appointment', 'failed', 'Missing booking_id or action');
    return res.status(400).json({ success: false, message: 'booking_id and action are required' });
  }

  const validActions = ['approve', 'reject', 'reschedule'];
  if (!validActions.includes(action.toLowerCase())) {
    await logAudit(staffId, 'manage_appointment', `Invalid action: ${action}`);
    return res.status(400).json({ success: false, message: 'Invalid action. Must be approve, reject, or reschedule' });
  }

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Get booking details
    const bookingCheck = await transaction.request()
      .input('booking_id', sql.Int, booking_id)
      .query(`
        SELECT b.booking_id, b.user_id, b.status, b.requested_time_date, ua.email, ua.name AS student_name
        FROM Booking b
        INNER JOIN UserAccount ua ON b.user_id = ua.user_id
        WHERE b.booking_id = @booking_id
      `);

    if (bookingCheck.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = bookingCheck.recordset[0];

    // Get nurse name
    const nurseResult = await transaction.request()
      .input('staff_id', sql.Int, staffId)
      .query(`
        SELECT ua.name, s.position
        FROM UserAccount ua
        INNER JOIN Staff s ON ua.user_id = s.user_id
        WHERE ua.user_id = @staff_id
      `);
    const nurse = nurseResult.recordset[0];
    const nurseName = nurse ? nurse.name : 'Clinic Staff';

    let appointmentId = null;
    let emailSubject = '';
    let emailBody = '';

    if (action.toLowerCase() === 'approve') {
      // Update booking
      await transaction.request()
        .input('booking_id', sql.Int, booking_id)
        .input('status', sql.VarChar, 'approved')
        .input('processed_at', sql.DateTime, new Date())
        .query(`UPDATE Booking SET status=@status, processed_at=@processed_at WHERE booking_id=@booking_id`);

      // Link staff
      await transaction.request()
        .input('booking_id', sql.Int, booking_id)
        .input('staff_id', sql.Int, staffId)
        .query(`INSERT INTO StaffBooking (booking_id, staff_id) VALUES (@booking_id, @staff_id)`);

      // Create appointment
      const appointmentInsert = await transaction.request()
        .input('booking_id', sql.Int, booking_id)
        .input('date_and_time', sql.DateTime, booking.requested_time_date)
        .input('status', sql.VarChar, 'pending')
        .input('duration_minutes', sql.Int, duration_minutes || 30)
        .input('nurse_name', sql.VarChar(100), nurseName)
        .input('notes', sql.VarChar(500), notes || null)
        .query(`
          INSERT INTO Appointment (booking_id, date_and_time, status, duration_minutes, nurse_name, notes)
          OUTPUT INSERTED.appointment_id
          VALUES (@booking_id, @date_and_time, @status, @duration_minutes, @nurse_name, @notes)
        `);
      appointmentId = appointmentInsert.recordset[0].appointment_id;

      // Notification
      await transaction.request()
        .input('appointment_id', sql.Int, appointmentId)
        .input('user_id', sql.Int, booking.user_id)
        .input('content', sql.VarChar, 'Your appointment has been approved.')
        .input('status', sql.VarChar, 'unread')
        .input('type', sql.VarChar, 'booking_update')
        .input('sent_at', sql.DateTime, new Date())
        .query(`INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
                VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)`);

      emailSubject = 'Appointment Approved';
      emailBody = `Hello ${booking.student_name},<br><br>Your appointment has been approved for ${booking.requested_time_date}.<br><br>- ${nurseName}`;

    } else if (action.toLowerCase() === 'reject') {
      await transaction.request()
        .input('booking_id', sql.Int, booking_id)
        .input('status', sql.VarChar, 'rejected')
        .input('processed_at', sql.DateTime, new Date())
        .query(`UPDATE Booking SET status=@status, processed_at=@processed_at WHERE booking_id=@booking_id`);

      await transaction.request()
        .input('appointment_id', sql.Int, null)
        .input('user_id', sql.Int, booking.user_id)
        .input('content', sql.VarChar, 'Your booking request has been rejected.')
        .input('status', sql.VarChar, 'unread')
        .input('type', sql.VarChar, 'booking_update')
        .input('sent_at', sql.DateTime, new Date())
        .query(`INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
                VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)`);

      emailSubject = 'Booking Rejected';
      emailBody = `Hello ${booking.student_name},<br><br>Unfortunately, your booking request has been rejected.<br><br>- ${nurseName}`;

    } else if (action.toLowerCase() === 'reschedule') {
      if (!new_date_time) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'new_date_time is required for reschedule' });
      }

      // Update appointment date/time
      const updateAppt = await transaction.request()
        .input('booking_id', sql.Int, booking_id)
        .input('new_date_time', sql.DateTime, new_date_time)
        .query(`UPDATE Appointment SET date_and_time=@new_date_time WHERE booking_id=@booking_id;
                SELECT appointment_id FROM Appointment WHERE booking_id=@booking_id`);

      appointmentId = updateAppt.recordset[0].appointment_id;

      await transaction.request()
        .input('appointment_id', sql.Int, appointmentId)
        .input('user_id', sql.Int, booking.user_id)
        .input('content', sql.VarChar, `Your appointment has been rescheduled to ${new_date_time}.`)
        .input('status', sql.VarChar, 'unread')
        .input('type', sql.VarChar, 'booking_update')
        .input('sent_at', sql.DateTime, new Date())
        .query(`INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
                VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)`);

      emailSubject = 'Appointment Rescheduled';
      emailBody = `Hello ${booking.student_name},<br><br>Your appointment has been rescheduled to ${new_date_time}.<br><br>- ${nurseName}`;
    }

    await transaction.commit();

    // Send transactional email
    await sendEmail({
      to: booking.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: emailSubject,
      text: emailBody.replace(/<br>/g, '\n'),
      html: emailBody
    });

    return res.status(200).json({
      success: true,
      message: `Booking ${action.toLowerCase()}d successfully`,
      appointment_id: appointmentId || null
    });

  } catch (error) {
    console.error('Error managing appointment:', error);
    return res.status(500).json({ success: false, message: 'Server error while managing appointment' });
  }
};


exports.getAppointmentHistory = async (req, res) => {
    const staffId = req.staff.user_id; // from authMiddleware

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('staffId', sql.Int, staffId)
            .query(`
                SELECT 
                    a.appointment_id,
                    a.date_and_time,
                    a.status AS appointment_status,
                    a.notes,
                    a.duration_minutes,
                    a.nurse_name,
                    b.booking_id,
                    b.status AS booking_status,
                    ua.user_id AS student_id,
                    ua.name AS student_name,
                    ua.email AS student_email,
                    ua.phone AS student_phone,
                    st.service_id,
                    st.name AS service_name,
                    st.category AS service_category,
                    st.description AS service_description,
                    st.price AS service_price
                FROM Appointment a
                INNER JOIN Booking b 
                    ON a.booking_id = b.booking_id
                INNER JOIN StaffBooking sb 
                    ON b.booking_id = sb.booking_id
                INNER JOIN UserAccount ua 
                    ON b.user_id = ua.user_id
                INNER JOIN ServiceType st
                    ON b.service_id = st.service_id
                WHERE sb.staff_id = @staffId
                  AND a.status IN ('pending', 'completed', 'cancelled', 'rejected', 'scheduled')
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

exports.searchAppointments = async (req, res) => {
  const { studentName, status, date } = req.query;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('studentName', sql.VarChar, studentName || null)
      .input('status', sql.VarChar, status || null)
      .input('date', sql.Date, date || null)
      .query(`
        SELECT 
            a.appointment_id,
            a.date_and_time,
            a.status AS appointment_status,
            a.notes,
            ua.user_id AS student_id,
            ua.name AS student_name,
            ua.email AS student_email,
            b.booking_id,
            b.status AS booking_status,
            st.name AS service_name
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        INNER JOIN UserAccount ua ON b.user_id = ua.user_id
        INNER JOIN ServiceType st ON b.service_id = st.service_id
        WHERE 
            (
              @studentName IS NULL 
              OR ua.name LIKE '%' + @studentName + '%'
              OR LEFT(ua.name, CHARINDEX(' ', ua.name + ' ') - 1) LIKE '%' + @studentName + '%'
              OR LTRIM(RIGHT(ua.name, LEN(ua.name) - CHARINDEX(' ', ua.name + ' '))) LIKE '%' + @studentName + '%'
            )
          AND (@status IS NULL OR a.status = @status)
          AND (@date IS NULL OR CAST(a.date_and_time AS DATE) = @date)
        ORDER BY a.date_and_time ASC
      `);

    res.status(200).json({
      success: true,
      data: result.recordset,
      message: 'Appointments retrieved successfully'
    });
  } catch (err) {
    console.error('Error searching appointments:', err);
    res.status(500).json({ success: false, message: 'Failed to search appointments' });
  }
};
exports.addInternalNote = async (req, res) => {
  const staffId = req.staff.user_id; // from authMiddleware
  const appointmentId = req.params.id;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ success: false, message: 'Note content is required' });
  }

  try {
    const pool = await poolPromise;

    // Validate appointment exists
    const check = await pool.request()
      .input('appointment_id', sql.Int, appointmentId)
      .query(`SELECT appointment_id FROM Appointment WHERE appointment_id = @appointment_id`);

    if (check.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Insert note
    const result = await pool.request()
      .input('appointment_id', sql.Int, appointmentId)
      .input('staff_id', sql.Int, staffId)
      .input('content', sql.VarChar, content)
      .query(`
        INSERT INTO InternalNote (appointment_id, staff_id, content)
        OUTPUT INSERTED.note_id, INSERTED.created_at
        VALUES (@appointment_id, @staff_id, @content)
      `);

    // Audit log
    await logAudit(
      staffId,
      'ADD_INTERNAL_NOTE',
      `Staff ${staffId} added a note to appointment ${appointmentId}`,
      pool
    );

    res.status(201).json({
      success: true,
      message: 'Internal note added successfully',
      note: result.recordset[0]
    });
  } catch (err) {
    console.error('Error adding internal note:', err);
    res.status(500).json({ success: false, message: 'Failed to add internal note' });
  }
};

exports.getInternalNotes = async (req, res) => {
  const appointmentId = req.params.id;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('appointment_id', sql.Int, appointmentId)
      .query(`
        SELECT n.note_id, n.content, n.created_at,
               s.user_id AS staff_id, ua.name AS staff_name
        FROM InternalNote n
        INNER JOIN Staff s ON n.staff_id = s.user_id
        INNER JOIN UserAccount ua ON s.user_id = ua.user_id
        WHERE n.appointment_id = @appointment_id
        ORDER BY n.created_at DESC
      `);

    res.status(200).json({
      success: true,
      notes: result.recordset
    });
  } catch (err) {
    console.error('Error fetching internal notes:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch internal notes' });
  }
};

exports.markAppointmentComplete = async (req, res) => {
  const staffId = req.staff.user_id;
  const { appointment_id, notes } = req.body;

  if (!appointment_id) {
    return res.status(400).json({ success: false, message: 'appointment_id is required' });
  }

  let transaction;

  try {
    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 1. Validate appointment and staff ownership
    const check = await transaction.request()
      .input('appointment_id', sql.Int, appointment_id)
      .input('staff_id', sql.Int, staffId)
      .query(`
        SELECT 
          a.appointment_id, 
          a.status, 
          a.booking_id,
          b.user_id,
          u.name AS user_name,
          u.email,
          u.phone,
          a.date_and_time
        FROM Appointment a
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        INNER JOIN StaffBooking sb ON b.booking_id = sb.booking_id
        INNER JOIN UserAccount u ON b.user_id = u.user_id
        WHERE a.appointment_id = @appointment_id
          AND sb.staff_id = @staff_id
      `);

    if (check.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Appointment not found or not assigned to this staff member' });
    }

    const appointment = check.recordset[0];

    if (appointment.status === 'completed') {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Appointment already completed' });
    }

    // 2. Update Appointment and Booking
    await transaction.request()
      .input('appointment_id', sql.Int, appointment_id)
      .input('notes', sql.VarChar, notes || null)
      .query(`
        UPDATE Appointment
        SET status = 'completed', notes = @notes
        WHERE appointment_id = @appointment_id
      `);

    // Explicit Booking update (even though trigger will handle it too)
    await transaction.request()
      .input('booking_id', sql.Int, appointment.booking_id)
      .query(`
        UPDATE Booking
        SET status = 'completed'
        WHERE booking_id = @booking_id
      `);

    // 3. Notification content
    const formattedDate = new Date(appointment.date_and_time).toLocaleString();
    const messageContent = `🎉 COMPLETED: Your appointment on ${formattedDate} has been marked as completed.`;
    const emailSubject = 'Appointment Completed';
    const emailBody = `
      Hello ${appointment.user_name},<br><br>
      Your appointment on ${formattedDate} has been successfully marked as completed.${notes ? `<br><br>Notes: ${notes}` : ''}<br><br>
      Thank you for visiting our healthcare facility.<br><br>
      Best regards,<br>
      Healthcare Team
    `;

    // 4. Insert notification in DB
    await transaction.request()
      .input('appointment_id', sql.Int, appointment_id)
      .input('user_id', sql.Int, appointment.user_id)
      .input('content', sql.VarChar, messageContent)
      .input('status', sql.VarChar, 'unread')
      .input('type', sql.VarChar, 'appointment_update')
      .input('sent_at', sql.DateTime, new Date())
      .query(`
        INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
        VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)
      `);

    // 5. Commit transaction before sending external communications
    await transaction.commit();

    // 6. Send Email + SMS (non-blocking)
    const notificationResults = {};

    try {
      if (appointment.phone) {
        await sendSMSNotification(appointment.phone, messageContent, appointment.user_id);
        notificationResults.sms = { success: true };
      }
    } catch (smsError) {
      console.error("❌ SMS sending failed:", smsError.message);
      notificationResults.sms = { success: false, error: smsError.message };
    }

    try {
      if (appointment.email) {
        await sendEmailNotification.sendEmail(
          appointment.email,
          emailSubject,
          emailBody.replace(/<br>/g, '\n'),
          emailBody
        );
        notificationResults.email = { success: true };
      }
    } catch (emailError) {
      console.error("❌ Email sending failed:", emailError.message);
      notificationResults.email = { success: false, error: emailError.message };
    }

    // 7. Log audit
    await logAudit(
      staffId,
      'COMPLETE_APPOINTMENT',
      `Staff ${staffId} marked appointment ${appointment_id} as completed`
    );

    // 8. Response
    res.status(200).json({
      success: true,
      message: 'Appointment and booking marked as completed',
      notifications: notificationResults
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error('Complete appointment error:', err);
    res.status(500).json({ success: false, message: 'Failed to complete appointment', error: err.message });
  }
};

//==========================
//Student profile management
//==========================
exports.getStudentProfile = async (req, res) => {
  const studentUserId = req.params.id;

  try {
    const pool = await poolPromise;

    // Get student profile
    const studentResult = await pool.request()
      .input('user_id', sql.Int, studentUserId)
      .query(`
        SELECT 
          s.student_number,
          ua.user_id,
          ua.name,
          ua.email,
          ua.phone,
          ua.created_at,
          ua.role
        FROM Student s
        JOIN UserAccount ua ON s.user_id = ua.user_id
        WHERE s.user_id = @user_id
      `);

    const student = studentResult.recordset[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Get appointment history
    const historyResult = await pool.request()
      .input('user_id', sql.Int, studentUserId)
      .query(`
        SELECT 
          a.appointment_id,
          a.date_and_time,
          a.status AS appointment_status,
          a.notes,
          b.booking_id,
          b.status AS booking_status,
          b.requested_time_date,
          b.created_at,
          b.processed_at,
          st.service_id,
          st.name AS service_name,
          st.category AS service_category,
          st.description AS service_description,
          st.price AS service_price
        FROM Booking b
        LEFT JOIN Appointment a ON b.booking_id = a.booking_id
        INNER JOIN ServiceType st ON b.service_id = st.service_id
        WHERE b.user_id = @user_id
        ORDER BY a.date_and_time DESC
      `);

    res.status(200).json({
      success: true,
      student,
      appointment_history: historyResult.recordset
    });

  } catch (err) {
    console.error('Student profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch student profile' });
  }
};

//========================
// Notification management
//=========================
exports.sendMessage = async (req, res) => {
  const staffId = req.staff?.user_id;
  const { user_id, message, subject, appointment_id } = req.body;

  if (!staffId) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  if (!user_id || !message) {
    return res.status(400).json({ success: false, message: 'user_id and message are required' });
  }

  try {
    const pool = await poolPromise;

    // Fetch recipient details
    const userResult = await pool.request()
      .input('user_id', sql.Int, user_id)
      .query(`
        SELECT user_id, email, phone, role, name
        FROM UserAccount
        WHERE user_id = @user_id
      `);

    const user = userResult.recordset[0];
    if (!user) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }
    if (user.role !== 'student') {
      return res.status(400).json({ success: false, message: 'Messages can only be sent to students' });
    }

    // Verify appointment
    if (appointment_id) {
      const apptCheck = await pool.request()
        .input('appointment_id', sql.Int, appointment_id)
        .query(`
          SELECT a.appointment_id, b.user_id AS student_id, a.date_and_time
          FROM Appointment a
          INNER JOIN Booking b ON a.booking_id = b.booking_id
          WHERE a.appointment_id = @appointment_id
        `);
      const appt = apptCheck.recordset[0];
      if (!appt) {
        return res.status(400).json({ success: false, message: 'Invalid appointment_id' });
      }
      if (appt.student_id !== user_id) {
        return res.status(400).json({ success: false, message: 'Appointment does not belong to the specified user' });
      }
    }

    // Send email via SendGrid
    const fromAddress = process.env.SENDGRID_FROM_EMAIL; 
    const finalSubject = subject || 'Clinic Message';
    const htmlBody = `<p>${message}</p>${appointment_id ? `<p>Appointment ID: ${appointment_id}</p>` : ''}`;

    const sendResult = await sendEmail({
      to: user.email,
      from: fromAddress,
      subject: finalSubject,
      text: message,
      html: htmlBody
    });

    // Log Notification              
    const notifInsert = await pool.request()
      .input('appointment_id', sql.Int, appointment_id || null)
      .input('content', sql.VarChar(sql.MAX), message)
      .input('status', sql.VarChar(50), 'sent')
      .input('type', sql.VarChar(50), appointment_id ? 'appointment_message' : 'general_message')
      .input('user_id', sql.Int, user_id)
      .query(`
        INSERT INTO Notification (appointment_id, content, status, type, user_id)
        OUTPUT INSERTED.notification_id, INSERTED.sent_at
        VALUES (@appointment_id, @content, @status, @type, @user_id)
      `);

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      sendgrid_status: sendResult.statusCode,
      notification: notifInsert.recordset[0]
    });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};



