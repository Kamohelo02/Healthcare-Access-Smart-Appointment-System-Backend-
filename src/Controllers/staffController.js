const { poolPromise } = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// ====	/staff/login — POST====
exports.loginStaff = async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = await poolPromise;

    // Find staff user by email and role
    const result = await pool.request()
      .input('email', email)
      .query(`
        SELECT 
           ua.user_id,
           ua.email,
           ua.name,
           ua.phone,
           ua.role,
           ua.password_hash,
           ua.account_status,
           s.position,
           s.is_admin
        FROM UserAccount ua
        JOIN Staff s ON ua.user_id = s.user_id
        WHERE ua.email = @email
      `);

    const user = result.recordset[0];
    if (!user) return res.status(404).json({ message: 'Staff account not found' });

    // Check if account is active
    if (user.account_status !== true && user.account_status !== 1) {
       return res.status(403).json({ message: 'Account is inactive. Contact admin.' });
    }

    // Compare password
    try {
       const isMatch = await bcrypt.compare(password, user.password_hash);
       if (!isMatch) return res.status(401).json({ message: 'Incorrect password' });
    } catch (err) {
     console.error('Password comparison failed:', err);
    }
   
    // Generate JWT
    const token = jwt.sign(
    {
        user_id: user.user_id,
        role: user.role,
        is_admin: user.is_admin
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    // Return token and staff info
   res.status(200).json({
      message: 'Login successful',
      token,
      staff: {
        user_id: user.user_id,
        full_name: user.name,         
        email: user.email,
        phone: user.phone,
        position: user.position,      
        is_admin: user.is_admin       
      }

    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
};

 //==== /schedule — GET ===
exports.getSchedule = async (req, res) => {
  const staffUserId = req.staff?.user_id;
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

  try {
    const pool = await poolPromise;

    // Confirm staff has time slots today
    const slotResult = await pool.request()
      .input('user_id', staffUserId)
      .input('date', today)
      .query(`
        SELECT slot_id, start_time, end_time
        FROM TimeSlot
        WHERE user_id = @user_id AND date = @date
      `);

    const slots = slotResult.recordset;
    if (slots.length === 0) {
      return res.status(200).json({ date: today, appointments: [] });
    }

    // Get appointments for today
    const appointmentResult = await pool.request()
      .query(`
        SELECT 
          a.appointment_id,
          a.date_and_time,
          a.status,
          a.notes,
          b.booking_id,
          ua.name AS student_name,
          ua.email AS student_email,
          s.student_number
        FROM Appointment a
        JOIN Booking b ON a.booking_id = b.booking_id
        JOIN UserAccount ua ON b.user_id = ua.user_id
        JOIN Student s ON ua.user_id = s.user_id
        WHERE a.date_and_time BETWEEN '09:00:00' AND '17:00:00'
        ORDER BY a.date_and_time ASC
      `);

    // Format time and date
    const formattedAppointments = appointmentResult.recordset.map(app => ({
      appointment_id: app.appointment_id,
      booking_id: app.booking_id,
      date: today,
      time: new Date(`1970-01-01T${app.date_and_time}`).toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      status: app.status,
      notes: app.notes,
      student_name: app.student_name,
      student_email: app.student_email,
      student_number: app.student_number
    }));

    res.status(200).json({
      date: today,
      appointments: formattedAppointments
    });
  } catch (err) {
    console.error('Schedule error:', err);
    res.status(500).json({ message: 'Failed to fetch schedule' });
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
  const userId = req.staff?.user_id;
  const { date, start_time, end_time } = req.body;

  console.log('Incoming availability request:', { userId, date, start_time, end_time });

  if (!userId || !date || !start_time || !end_time) {
    console.log('Missing required fields');
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const pool = await poolPromise;
    console.log('Connected to DB');

    const result = await pool.request()
      .input('user_id', userId)
      .input('date', date)
      .input('start_time', start_time)
      .input('end_time', end_time)
      .input('status', 'available')
      .query(`
        INSERT INTO TimeSlot (user_id, date, start_time, end_time, status)
        VALUES (@user_id, @date, @start_time, @end_time, @status)
      `);

    console.log('Insert result:', result);

    const formattedStart = new Date(start_time).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const formattedEnd = new Date(end_time).toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    res.status(201).json({
      message: 'Availability added successfully',
      slot: {
        date,
        start_time: formattedStart,
        end_time: formattedEnd,
        status: 'available'
      }
    });
  } catch (err) {
    console.error('Add availability error:', err);
    res.status(500).json({ message: 'Failed to add availability' });
  }
};

//===== /appointments/manage — PUT =====
exports.manageAppointment = async (req, res) => {
  const staffUserId = req.staff?.user_id;
  const { booking_id, status } = req.body;

  try {
    const pool = await poolPromise;

    // Validate booking exists
    const result = await pool.request()
      .input('booking_id', booking_id)
      .query(`
        SELECT booking_id, status
        FROM Booking
        WHERE booking_id = @booking_id
      `);

    const booking = result.recordset[0];
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Update booking status and processed timestamp
    await pool.request()
      .input('booking_id', booking_id)
      .input('status', status)
      .input('processed_at', new Date())
      .query(`
        UPDATE Booking
        SET status = @status, processed_at = @processed_at
        WHERE booking_id = @booking_id
      `);

    res.status(200).json({ message: `Booking ${status} successfully` });
  } catch (err) {
    console.error('Manage booking error:', err);
    res.status(500).json({ message: 'Failed to update booking status' });
  }
};

//====== /appointments/history — GET =====
exports.getAppointmentHistory = async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .query(`
        SELECT 
          a.appointment_id,
          a.date_and_time,
          a.status,
          a.notes,
          b.booking_id,
          ua.name AS student_name,
          ua.email AS student_email,
          s.student_number
        FROM Appointment a
        JOIN Booking b ON a.booking_id = b.booking_id
        JOIN UserAccount ua ON b.user_id = ua.user_id
        JOIN Student s ON ua.user_id = s.user_id
        WHERE a.status IN ('completed', 'cancelled', 'rejected')
        ORDER BY a.date_and_time DESC
      `);

    res.status(200).json({
      history: result.recordset
    });
  } catch (err) {
    console.error('Appointment history error:', err);
    res.status(500).json({ message: 'Failed to fetch appointment history' });
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
  const senderUserId = req.staff?.user_id;
  const { student_user_id, message, appointment_id } = req.body;

  try {
    const pool = await poolPromise;

    // Validate student exists
    const studentResult = await pool.request()
      .input('user_id', student_user_id)
      .query(`
        SELECT email, phone
        FROM UserAccount
        WHERE user_id = @user_id  AND role = 'student'
      `);

    const student = studentResult.recordset[0];
    if (!student) return res.status(404).json({ message: 'Student not found' });

    // Insert notification
    await pool.request()
      .input('appointment_id', appointment_id)
      .input('user_id', student_user_id)
      .input('content', message)
      .input('status', 'delivered')
      .input('type', 'staff_message')
      .input('sent_at', new Date())
      .query(`
        INSERT INTO Notification (appointment_id, user_id, content, status, type, sent_at)
        VALUES (@appointment_id, @user_id, @content, @status, @type, @sent_at)
      `);

    console.log(`📧 Message sent to ${student.email} | 📱 ${student.phone}`);

    res.status(200).json({
      message: 'Notification sent successfully',
      recipient_id: student_user_id,
      status: 'delivered'
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Failed to send message', error: err.message });
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



