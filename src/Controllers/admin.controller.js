const { sql, poolPromise } = require("../config/db");
const sendSMSNotification = require("../Utils/sendSMSNotification");  //not workingg with real numbers yet
const sendEmailNotification = require("../Utils/sendEmailNotification");
const bcrypt = require('bcryptjs');
const twilio = require('twilio');


// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID, 
  process.env.TWILIO_AUTH_TOKEN
);




// ==========================
// Users Management
// ==========================
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role: userRole, status } = req.query;
    const offset = (page - 1) * limit;

    const pool = await poolPromise;
    let query = `
      SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.created_at,
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

    query += ` ORDER BY u.created_at DESC OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

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
        SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.created_at,
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
      SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.created_at,
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

    searchQuery += searchConditions.join(' OR ') + ` ORDER BY u.created_at DESC`;

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

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, phone, account_status, student_number, password } = req.body;

    const pool = await poolPromise;
    
    let updateFields = [];
    const inputs = { userId: id };

    if (email !== undefined) {
      updateFields.push('email = @email');
      inputs.email = email;
    }

    if (name !== undefined) {
      updateFields.push('name = @name');
      inputs.name = name;
    }

    if (phone !== undefined) {
      updateFields.push('phone = @phone');
      inputs.phone = phone;
    }

    if (account_status !== undefined) {
      updateFields.push('account_status = @account_status');
      inputs.account_status = account_status;
    }

    if (password !== undefined) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push('password_hash = @password_hash');
      inputs.password_hash = hashedPassword;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No fields provided for update" 
      });
    }

    const updateUserQuery = `
      UPDATE UserAccount 
      SET ${updateFields.join(', ')} 
      WHERE user_id = @userId
    `;

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, key === 'account_status' ? sql.Bit : sql.VarChar, inputs[key]);
    });

    const userResult = await request.query(updateUserQuery);

    if (!userResult.rowsAffected[0]) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    if (student_number !== undefined) {
      const studentCheck = await pool.request()
        .input('userId', sql.Int, id)
        .query('SELECT * FROM Student WHERE user_id = @userId');

      if (studentCheck.recordset.length > 0) {
        await pool.request()
          .input('userId', sql.Int, id)
          .input('student_number', sql.VarChar, student_number)
          .query('UPDATE Student SET student_number = @student_number WHERE user_id = @userId');
      } else {
        const userRoleCheck = await pool.request()
          .input('userId', sql.Int, id)
          .query('SELECT role FROM UserAccount WHERE user_id = @userId');
        
        if (userRoleCheck.recordset[0]?.role === 'student') {
          await pool.request()
            .input('userId', sql.Int, id)
            .input('student_number', sql.VarChar, student_number)
            .query('INSERT INTO Student (user_id, student_number) VALUES (@userId, @student_number)');
        }
      }
    }

    const updatedUser = await pool.request()
      .input("userId", sql.Int, id)
      .query(`
        SELECT u.user_id, u.email, u.name, u.phone, u.role, u.account_status, u.created_at,
               s.student_number
        FROM UserAccount u
        LEFT JOIN Student s ON u.user_id = s.user_id
        WHERE u.user_id = @userId
      `);

    res.json({
      success: true,
      message: "User updated successfully",
      user: updatedUser.recordset[0]
    });

  } catch (err) {
    console.error("❌ Update user error:", err);
    
    if (err.number === 2627 || err.message.includes('duplicate')) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error updating user",
      error: err.message,
    });
  }
};

exports.deleteUser = async (req, res) => {
  const transaction = new sql.Transaction(await poolPromise);
  try {
    const { id } = req.params;

    await transaction.begin();

    await transaction.request()
      .input("userId", sql.Int, id)
      .query("DELETE FROM Student WHERE user_id = @userId");

    await transaction.request()
      .input("userId", sql.Int, id)
      .query("DELETE FROM Staff WHERE user_id = @userId");

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
// System Settings
// ==========================
exports.getSettings = async (req, res) => {
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

exports.updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ 
        success: false, 
        message: "Settings object is required" 
      });
    }

    const pool = await poolPromise;
    
    for (const [key, value] of Object.entries(settings)) {
      await pool.request()
        .input('key', sql.VarChar, key)
        .input('value', sql.VarChar, value)
        .query(`
          UPDATE SystemConfiguration 
          SET config_value = @value 
          WHERE config_key = @key
        `);
    }

    res.json({ 
      success: true,
      message: "Settings updated successfully" 
    });
  } catch (err) {
    console.error("Update settings error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error updating settings",
      error: err.message 
    });
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
    let query =  `
  SELECT 
    a.appointment_id, 
    a.date_and_time, 
    a.status, 
    a.notes,
    a.booking_id,
    a.duration_minutes,
    b.user_id,
    u.email,
    u.phone,
    a.nurse_name
  FROM Appointment a
  INNER JOIN Booking b ON a.booking_id = b.booking_id
  INNER JOIN UserAccount u ON b.user_id = u.user_id
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
    let searchQuery =  `
  SELECT 
    a.appointment_id, 
    a.date_and_time, 
    a.status, 
    a.notes,
    a.booking_id,
    a.duration_minutes,
    b.user_id,
    u.email,
    u.phone,
    a.nurse_name
  FROM Appointment a
  INNER JOIN Booking b ON a.booking_id = b.booking_id
  INNER JOIN UserAccount u ON b.user_id = u.user_id
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
    
    const checkResult = await pool.request()
      .input("appointmentId", sql.Int, id)
      .query("SELECT appointment_id FROM Appointment WHERE appointment_id = @appointmentId");

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Appointment not found" 
      });
    }

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
  let transaction;

  try {
    const { id } = req.params;
    const { status, notes, new_date_time } = req.body;

    console.log("🔍 UPDATE REQUEST:", { id, status, notes, new_date_time });

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
    
    // FIRST: Let's debug the actual data without transaction
    console.log("🔍 DEBUG: Checking appointment data...");
    const debugResult = await pool.request()
      .input("appointmentId", sql.Int, id)
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
        LEFT JOIN Booking b ON a.booking_id = b.booking_id
        LEFT JOIN UserAccount u ON b.user_id = u.user_id
        WHERE a.appointment_id = @appointmentId
      `);

    console.log("🔍 DEBUG RESULT:", {
      recordCount: debugResult.recordset.length,
      data: debugResult.recordset[0]
    });

    if (debugResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
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

    // If booking_id is invalid, let's check what appointments actually exist
    if (!bookingId || isNaN(bookingId)) {
      console.log("🔍 CHECKING ALL APPOINTMENTS...");
      const allAppointments = await pool.request().query(`
        SELECT TOP 10 appointment_id, booking_id, status 
        FROM Appointment 
        ORDER BY appointment_id DESC
      `);
      console.log("🔍 RECENT APPOINTMENTS:", allAppointments.recordset);
    }

    // Now start the transaction with the validated data
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const appointment = debugData;
    const oldStatus = appointment.status;
    const userId = appointment.user_id;

    // Use whichever booking_id is valid
    const validBookingId = bookingId && !isNaN(bookingId) ? bookingId : 
                          bookingIdFromJoin && !isNaN(bookingIdFromJoin) ? bookingIdFromJoin : null;

    console.log("🔍 USING BOOKING ID:", validBookingId);

    if (!validBookingId) {
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: "No valid booking ID found for this appointment"
      });
    }

    // 2. Update Appointment
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

    // 2b. Update Booking table
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

    // 4. Insert Notification
    await transaction.request()
      .input("userId", sql.Int, userId)
      .input("appointmentId", sql.Int, id)
      .input("content", sql.NVarChar, messageContent)
      .input("type", sql.VarChar, "appointment_status")
      .input("status", sql.VarChar, "unread")
      .input("sent_at", sql.DateTime, new Date())
      .query(`
        INSERT INTO Notification (user_id, appointment_id, content, type, status, sent_at)
        VALUES (@userId, @appointmentId, @content, @type, @status, @sent_at)
      `);

    await transaction.commit();

    console.log("✅ TRANSACTION COMMITTED SUCCESSFULLY");

    // 5. Send notifications
    const notificationResults = {};
    const allowedStatuses = ["confirmed", "cancelled", "completed", "rescheduled"];

    if (allowedStatuses.includes(status.toLowerCase()) && appointment.phone && oldStatus !== status) {
      try {
        await sendSMSNotification(appointment.phone, messageContent, userId);
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
        notifications: notificationResults
      }
    });

  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("❌ Update appointment status error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating appointment status",
      error: err.message
    });
  }
};

// ==========================
// FAQs management
// ==========================
exports.getFaqs = async (req, res) => {
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

exports.addFaq = async (req, res) => {
  try {
    const { question, answer, category } = req.body || {};
    const userId = req.user.user_id;

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
exports.getAnnouncements = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      sortBy = 'created_at', 
      sortOrder = 'DESC',
      startDate,
      endDate,
      userId
    } = req.query;

    const offset = (page - 1) * limit;
    const pool = await poolPromise;

    let query = `
      SELECT 
        a.announcement_id, 
        a.user_id, 
        a.title, 
        a.content, 
        a.created_at,
        u.name as author_name,
        u.email as author_email
      FROM Announcement a
      LEFT JOIN UserAccount u ON a.user_id = u.user_id
    `;

    const whereConditions = [];
    const inputs = {};

    // Search filter (searches in title and content)
    if (search) {
      whereConditions.push(`(a.title LIKE @search OR a.content LIKE @search)`);
      inputs.search = `%${search}%`;
    }

    // Date range filter
    if (startDate) {
      whereConditions.push(`CAST(a.created_at AS DATE) >= @startDate`);
      inputs.startDate = startDate;
    }

    if (endDate) {
      whereConditions.push(`CAST(a.created_at AS DATE) <= @endDate`);
      inputs.endDate = endDate;
    }

    // User filter
    if (userId) {
      whereConditions.push(`a.user_id = @userId`);
      inputs.userId = parseInt(userId);
    }

    // Add WHERE clause if we have conditions
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Validate and apply sorting
    const validSortColumns = ['created_at', 'title', 'author_name'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    // Handle special case for author_name sorting
    const orderByColumn = safeSortBy === 'author_name' ? 'u.name' : `a.${safeSortBy}`;

    query += ` ORDER BY ${orderByColumn} ${safeSortOrder} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

    // Execute main query
    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM Announcement a LEFT JOIN UserAccount u ON a.user_id = u.user_id`;
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
      announcements: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / limit)
      },
      filters: {
        search: search || '',
        sortBy: safeSortBy,
        sortOrder: safeSortOrder,
        startDate: startDate || '',
        endDate: endDate || '',
        userId: userId || ''
      }
    });

  } catch (err) {
    console.error("Get Announcements error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error fetching announcements",
      error: err.message 
    });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ 
        success: false,
        message: "Title and content are required" 
      });
    }

    // Validate title length
    if (title.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Title must be less than 200 characters"
      });
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input("userId", sql.Int, req.user.user_id)
      .input("title", sql.VarChar, title)
      .input("content", sql.VarChar, content)
      .query(`
        INSERT INTO Announcement (user_id, title, content, created_at)
        OUTPUT INSERTED.announcement_id, INSERTED.created_at
        VALUES (@userId, @title, @content, GETDATE())
      `);

    // Get the complete announcement with author info
    const newAnnouncement = await pool.request()
      .input("announcementId", sql.Int, result.recordset[0].announcement_id)
      .query(`
        SELECT 
          a.announcement_id, 
          a.user_id, 
          a.title, 
          a.content, 
          a.created_at,
          u.name as author_name,
          u.email as author_email
        FROM Announcement a
        LEFT JOIN UserAccount u ON a.user_id = u.user_id
        WHERE a.announcement_id = @announcementId
      `);

    res.status(201).json({ 
      success: true,
      message: "Announcement created successfully",
      announcement: newAnnouncement.recordset[0]
    });

  } catch (err) {
    console.error("Create Announcement error:", err);
    
    if (err.number === 2627 || err.message.includes('duplicate')) {
      return res.status(400).json({
        success: false,
        message: "An announcement with this title already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating announcement",
      error: err.message,
    });
  }
};

exports.searchAnnouncements = async (req, res) => {
  try {
    const { query, field = 'all' } = req.query;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        message: "Search query is required" 
      });
    }

    const pool = await poolPromise;
    let searchQuery = `
      SELECT 
        a.announcement_id, 
        a.user_id, 
        a.title, 
        a.content, 
        a.created_at,
        u.name as author_name
      FROM Announcement a
      LEFT JOIN UserAccount u ON a.user_id = u.user_id
      WHERE 
    `;

    const searchConditions = [];
    const inputs = { query: `%${query}%` };

    switch (field) {
      case 'title':
        searchConditions.push(`a.title LIKE @query`);
        break;
      case 'content':
        searchConditions.push(`a.content LIKE @query`);
        break;
      case 'author':
        searchConditions.push(`u.name LIKE @query`);
        break;
      default:
        searchConditions.push(`(a.title LIKE @query OR a.content LIKE @query OR u.name LIKE @query)`);
    }

    searchQuery += searchConditions.join(' OR ') + ` ORDER BY a.created_at DESC`;

    const result = await pool.request()
      .input('query', sql.VarChar, `%${query}%`)
      .query(searchQuery);

    res.json({
      success: true,
      announcements: result.recordset,
      count: result.recordset.length,
      searchInfo: {
        query,
        field,
        resultsFound: result.recordset.length
      }
    });
  } catch (err) {
    console.error("Search announcements error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error searching announcements",
      error: err.message 
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
    
    const cancelledResult = await pool.request().query(`
      SELECT 
        COUNT(*) as total_cancelled,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'no-show' THEN 1 ELSE 0 END) as missed
      FROM Appointment
      WHERE status IN ('cancelled', 'no-show')
    `);

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
        ss.user_id,
        u.name as staff_name,
        u.email,
        u.role,
        ss.work_date,
        ss.start_time,
        ss.end_time,
        ss.notes
      FROM StaffSchedule ss
      INNER JOIN UserAccount u ON ss.user_id = u.user_id
      WHERE u.role IN ('admin', 'nurse', 'staff') 
        AND ss.work_date >= CAST(GETDATE() AS DATE)
      ORDER BY ss.work_date, ss.start_time
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
    const { user_id, work_date, start_time, end_time, notes } = req.body;

    if (!user_id || !work_date || !start_time || !end_time) {
      return res.status(400).json({ 
        success: false,
        message: "User ID, work date, start time, and end time are required" 
      });
    }

    // Verify the user is actually staff
    const pool = await poolPromise;
    const userCheck = await pool.request()
      .input('user_id', sql.Int, user_id)
      .query('SELECT role FROM UserAccount WHERE user_id = @user_id AND role IN (\'admin\', \'nurse\', \'staff\')');

    if (userCheck.recordset.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "User is not a staff member" 
      });
    }

    

    await pool.request()
      .input('user_id', sql.Int, user_id)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.VarChar, start_time)  
      .input('end_time', sql.VarChar, end_time)      
      .input('notes', sql.VarChar, notes)
      .query(`
        INSERT INTO StaffSchedule (user_id, work_date, start_time, end_time, notes)
        VALUES (@user_id, @work_date, @start_time, @end_time, @notes)
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
    const { user_id, work_date, start_time, end_time, notes } = req.body;

    const pool = await poolPromise;
    
    // Verify the user is staff if user_id is being updated
    if (user_id) {
      const userCheck = await pool.request()
        .input('user_id', sql.Int, user_id)
        .query('SELECT role FROM UserAccount WHERE user_id = @user_id AND role IN (\'admin\', \'nurse\', \'staff\')');

      if (userCheck.recordset.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "User is not a staff member" 
        });
      }
    }



    const result = await pool.request()
      .input('schedule_id', sql.Int, id)
      .input('user_id', sql.Int, user_id)
      .input('work_date', sql.Date, work_date)
      .input('start_time', sql.VarChar, start_time)  
      .input('end_time', sql.VarChar, end_time)      
      .input('notes', sql.VarChar, notes)
      .query(`
        UPDATE StaffSchedule 
        SET user_id = @user_id, work_date = @work_date, 
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



//========================
// Notification management
//=========================
exports.getAllNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const offset = (page - 1) * limit;
    
    const pool = await poolPromise;
    
    let whereConditions = [];
    const inputs = {};
    
    if (status) {
      whereConditions.push("n.status = @status");
      inputs.status = status;
    }
    
    if (type) {
      whereConditions.push("n.type = @type");
      inputs.type = type;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // FIXED QUERY - using correct table structure
    const query = `
      SELECT 
        n.notification_id,
        n.appointment_id,
        n.user_id,
        n.content,
        n.type,
        n.status,
        n.sent_at,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        a.date_and_time AS appointment_date,
        a.status AS appointment_status
      FROM Notification n
      LEFT JOIN UserAccount u ON n.user_id = u.user_id
      LEFT JOIN Appointment a ON n.appointment_id = a.appointment_id
      ${whereClause}
      ORDER BY n.sent_at DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `;

    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      request.input(key, sql.VarChar, inputs[key]);
    });

    const result = await request.query(query);

    // Get total count
    const countResult = await pool.request().query(`
      SELECT COUNT(*) as total 
      FROM Notification n
      ${whereClause}
    `);

    res.status(200).json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total,
        pages: Math.ceil(countResult.recordset[0].total / limit)
      }
    });
  } catch (error) {
    console.error("❌ Error fetching notifications:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch notifications" 
    });
  }
};

exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(id)) {
      return res.status(400).json({ 
        success: false,
        error: "Valid notification ID is required" 
      });
    }

    const pool = await poolPromise;
    
    // FIXED QUERY
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
          n.notification_id,
          n.appointment_id,
          n.user_id,
          n.content,
          n.type,
          n.status,
          n.sent_at,
          u.name AS user_name,
          u.email AS user_email,
          u.phone AS user_phone,
          a.date_and_time AS appointment_date,
          a.status AS appointment_status
        FROM Notification n
        LEFT JOIN UserAccount u ON n.user_id = u.user_id
        LEFT JOIN Appointment a ON n.appointment_id = a.appointment_id
        WHERE n.notification_id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Notification not found" 
      });
    }

    res.status(200).json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    console.error("❌ Error fetching notification:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch notification" 
    });
  }
};

exports.updateNotificationStatus = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { status } = req.body;

    if (!status || !['unread', 'read', 'sent', 'failed'].includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: "Valid status (unread, read, sent, failed) is required" 
      });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("status", sql.VarChar, status)
      .input("notificationId", sql.Int, notificationId)
      .query(`
        UPDATE Notification
        SET status = @status
        WHERE notification_id = @notificationId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Notification not found" 
      });
    }

    res.status(200).json({ 
      success: true,
      message: "Notification status updated successfully" 
    });
  } catch (error) {
    console.error("Error updating notification status:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to update notification status" 
    });
  }
};
exports.sendManualNotification = async (req, res) => {
  try {
    const { appointment_id, content, type } = req.body;

    const pool = await poolPromise;
    await pool.request()
      .input("appointment_id", sql.Int, appointment_id)
      .input("content", sql.VarChar, content)
      .input("type", sql.VarChar, type)
      .input("status", sql.VarChar, "sent")
      .input("sent_at", sql.DateTime, new Date())
      .query(`
        INSERT INTO Notification (appointment_id, content, type, status, sent_at)
        VALUES (@appointment_id, @content, @type, @status, @sent_at)
      `);

    res.status(201).json({ message: "Notification sent successfully" });
  } catch (error) {
    console.error("Error sending notification:", error.message);
    res.status(500).json({ error: "Failed to send notification" });
  }
};


exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input("notificationId", sql.Int, notificationId)
      .query(`
        DELETE FROM Notification WHERE notification_id = @notificationId
      `);

    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error.message);
    res.status(500).json({ error: "Failed to delete notification" });
  }
};


exports.getNotificationStats = async (req, res) => {
  try {
    const pool = await poolPromise;
    const statusResult = await pool.request().query(`
      SELECT status, COUNT(*) AS count
      FROM Notification
      GROUP BY status
    `);

    const typeResult = await pool.request().query(`
      SELECT type, COUNT(*) AS count
      FROM Notification
      GROUP BY type
    `);

    const dailyResult = await pool.request().query(`
      SELECT CAST(sent_at AS DATE) AS date, COUNT(*) AS count
      FROM Notification
      GROUP BY CAST(sent_at AS DATE)
      ORDER BY date DESC
    `);

    res.status(200).json({
      byStatus: statusResult.recordset,
      byType: typeResult.recordset,
      daily: dailyResult.recordset,
    });
  } catch (error) {
    console.error("Error fetching notification stats:", error.message);
    res.status(500).json({ error: "Failed to fetch notification stats" });
  }
};


exports.bulkUpdateNotificationStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid notification IDs" });
    }

    const pool = await poolPromise;
    await pool.request()
      .input("status", sql.VarChar, status)
      .query(`
        UPDATE Notification
        SET status = @status
        WHERE notification_id IN (${ids.join(",")})
      `);

    res.status(200).json({ message: "Bulk notification status updated" });
  } catch (error) {
    console.error("Error bulk updating notifications:", error.message);
    res.status(500).json({ error: "Failed to bulk update notifications" });
  }
};



// ==========================
// Feedback Management - Admin
// ==========================
exports.getAllFeedback = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT fb.feedback_id, fb.message, fb.rating, fb.submitted_at, fb.status,
             u.name as user_name, u.email, fb.appointment_id
      FROM FeedbackBuffer fb
      INNER JOIN UserAccount u ON fb.user_id = u.user_id
      ORDER BY fb.submitted_at DESC
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
    const adminId = req.user.user_id;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: "Valid status (approved/rejected) is required" 
      });
    }

    const pool = await poolPromise;
    
    // Start transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Get the feedback from buffer
      const feedbackResult = await transaction.request()
        .input('feedback_id', sql.Int, id)
        .query(`
          SELECT * FROM FeedbackBuffer 
          WHERE feedback_id = @feedback_id
        `);

      if (feedbackResult.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ 
          success: false,
          message: "Feedback not found" 
        });
      }

      const feedback = feedbackResult.recordset[0];

      // Insert into final table
      await transaction.request()
        .input('user_id', sql.Int, feedback.user_id)
        .input('appointment_id', sql.Int, feedback.appointment_id)
        .input('message', sql.NVarChar, feedback.message)
        .input('rating', sql.Int, feedback.rating)
        .input('submitted_at', sql.DateTime, feedback.submitted_at)
        .input('status', sql.VarChar, status)
        .input('reviewed_at', sql.DateTime, new Date())
        .input('reviewed_by', sql.Int, adminId)
        .query(`
          INSERT INTO FeedbackFinal 
          (user_id, appointment_id, message, rating, submitted_at, status, reviewed_at, reviewed_by)
          VALUES (@user_id, @appointment_id, @message, @rating, @submitted_at, @status, @reviewed_at, @reviewed_by)
        `);

      // Remove from buffer table
      await transaction.request()
        .input('feedback_id', sql.Int, id)
        .query('DELETE FROM FeedbackBuffer WHERE feedback_id = @feedback_id');

      await transaction.commit();

      res.json({ 
        success: true,
        message: `Feedback ${status} successfully` 
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (err) {
    console.error("Update feedback status error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error updating feedback status" 
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
              a.status AS appointment_status,
              a.duration_minutes,
              u.user_id AS patient_id,
              u.name AS patient_name,
              u.email AS patient_email,
              b.booking_id,
              b.status AS booking_status,
              b.requested_time_date,
              staff.user_id AS staff_id,
              staff.name AS staff_name,
              staff.email AS staff_email,
              st.position AS staff_position
            FROM Appointment a
            INNER JOIN Booking b 
              ON a.booking_id = b.booking_id
            INNER JOIN UserAccount u 
              ON b.user_id = u.user_id
            LEFT JOIN Staff st 
              ON st.user_id = u.user_id -- if user is staff
            LEFT JOIN UserAccount staff 
              ON staff.user_id = st.user_id
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
            u.created_at,
            COUNT(a.appointment_id) as total_appointments
          FROM UserAccount u
          LEFT JOIN Booking b ON u.user_id = b.user_id
          LEFT JOIN Appointment a ON b.booking_id = a.booking_id
          GROUP BY u.user_id, u.name, u.email, u.role, u.account_status, u.created_at
          ORDER BY u.created_at DESC
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
    res.status(500).json({ 
      success: false,
      message: "Server error generating report",
      error: err.message 
    });
  }
};



  //================================
  // Send notification (SMS or Email)
  //=================================
  exports.sendNotification= async (req, res) =>{
    try {
      const { type, phoneNumber, email, subject, message, htmlContent, userId } = req.body;

      // Validate required fields based on type
      if (type === 'sms' && (!phoneNumber || !message)) {
        return res.status(400).json({ 
          success: false,
          error: "For SMS: phoneNumber and message are required" 
        });
      }

      if (type === 'email' && (!email || !subject || !message)) {
        return res.status(400).json({ 
          success: false,
          error: "For Email: email, subject, and message are required" 
        });
      }

      if (!type || !['sms', 'email'].includes(type)) {
        return res.status(400).json({ 
          success: false,
          error: "Type must be 'sms' or 'email'" 
        });
      }

      console.log(`📨 Sending ${type.toUpperCase()} notification:`, {
        to: type === 'sms' ? phoneNumber : email,
        subject: subject || 'N/A',
        messageLength: message.length,
        userId: userId || 'not-provided'
      });

      let result;

      if (type === 'sms') {
        result = await sendSMSNotification.sendSMS(phoneNumber, message, userId);
      } else {
        result = await sendEmailNotification.sendEmail(email, subject, message, htmlContent);
      }

      // Log notification in database
      await this.logNotification({
        type,
        recipient: type === 'sms' ? phoneNumber : email,
        content: message,
        subject: subject || 'SMS Notification',
        status: 'sent',
        userId
      });

      res.status(200).json({
        success: true,
        message: `${type.toUpperCase()} notification sent successfully`,
        data: result
      });

    } catch (error) {
      console.error("❌ Send Notification Error:", error.message);
      
      res.status(500).json({
        success: false,
        error: error.message,
        details: `Failed to send ${req.body.type} notification`
      });
    }
  }

  //====================================
   //Send appointment status notification
   //=====================================
  exports.sendAppointmentNotification =async (req, res)=>{
    try {
      const { appointmentId, notificationType } = req.body;

      if (!appointmentId) {
        return res.status(400).json({
          success: false,
          error: "Appointment ID is required"
        });
      }

      // Get appointment details
      const pool = await poolPromise;
      const appointmentResult = await pool.request()
        .input("appointmentId", sql.Int, appointmentId)
        .query(`
          SELECT 
            a.appointment_id, 
            a.date_and_time, 
            a.status,
            a.notes,
            u.user_id,
            u.name as patient_name,
            u.email,
            u.phone
          FROM Appointment a
          INNER JOIN Booking b ON a.booking_id = b.booking_id
          INNER JOIN UserAccount u ON b.user_id = u.user_id
          WHERE a.appointment_id = @appointmentId
        `);

      if (appointmentResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Appointment not found"
        });
      }

      const appointment = appointmentResult.recordset[0];
      const formattedDate = new Date(appointment.date_and_time).toLocaleString();

      // Create notification message based on status
      let message, emailSubject;
      switch (appointment.status.toLowerCase()) {
        case 'confirmed':
          message = `✅ CONFIRMED: Your appointment on ${formattedDate} has been confirmed. See you then!`;
          emailSubject = 'Appointment Confirmed';
          break;
        case 'cancelled':
          message = `❌ CANCELLED: Your appointment on ${formattedDate} has been cancelled. Contact us to reschedule.`;
          emailSubject = 'Appointment Cancelled';
          break;
        case 'completed':
          message = `🎉 COMPLETED: Your appointment on ${formattedDate} is complete. Thank you for visiting!`;
          emailSubject = 'Appointment Completed';
          break;
        default:
          message = `Your appointment status has been updated to: ${appointment.status}`;
          emailSubject = 'Appointment Status Update';
      }

      const results = {};
      const notificationData = {
        patientName: appointment.patient_name,
        appointmentDate: appointment.date_and_time,
        status: appointment.status,
        notes: appointment.notes
      };

      // Send email if available and requested
      if (appointment.email && (!notificationType || notificationType === 'email')) {
        try {
          results.email = await sendEmailNotification.sendAppointmentNotification(
            appointment.email, 
            notificationData
          );
        } catch (emailError) {
          results.email = { success: false, error: emailError.message };
        }
      }

      // Send SMS if available and requested
      if (appointment.phone && (!notificationType || notificationType === 'sms')) {
        try {
          results.sms = await sendSMSNotification.sendSMS(appointment.phone, message, appointment.user_id);
        } catch (smsError) {
          results.sms = { success: false, error: smsError.message };
        }
      }

      res.status(200).json({
        success: true,
        message: "Appointment notifications sent",
        data: results
      });

    } catch (error) {
      console.error("❌ Send Appointment Notification Error:", error.message);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  //=============================
  // Log notification in database
 //==============================
exports.logNotification = async (notificationData) => {
  try {
    const pool = await poolPromise;
    
    // Use the correct schema that matches your staff endpoints
    await pool.request()
      .input("appointment_id", sql.Int, notificationData.appointment_id || null)
      .input("user_id", sql.Int, notificationData.user_id || null)
      .input("content", sql.NVarChar, notificationData.content)
      .input("type", sql.VarChar, notificationData.type || "appointment_update")
      .input("status", sql.VarChar, notificationData.status || "unread")
      .input("sent_at", sql.DateTime, notificationData.sent_at || new Date())
      .query(`
        INSERT INTO Notification (appointment_id, user_id, content, type, status, sent_at)
        VALUES (@appointment_id, @user_id, @content, @type, @status, @sent_at)
      `);
      
    console.log("✅ Notification logged successfully");
  } catch (error) {
    console.error("❌ Failed to log notification:", error.message);
    throw error;
  }
};


  //================
  // Test endpoints
  //=================
  exports.testSMSEndpoint = async (req, res) =>{
    try {
      const result = await sendSMSNotification.sendSMS(
        "+254700000001", 
        `Test SMS from Healthcare App - ${new Date().toISOString()}`
      );
      
      res.json({
        success: true,
        message: "SMS sent successfully!",
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  exports.testEmailEndpoint =async (req, res) =>{
    try {
      const result = await sendEmailNotification.sendEmail(
        "test@example.com",
        "Test Email from Healthcare App",
        `This is a test email sent at ${new Date().toISOString()}`,
        `<p>This is a <strong>test email</strong> sent at ${new Date().toISOString()}</p>`
      );
      
      res.json({
        success: true,
        message: "Email sent successfully!",
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  
