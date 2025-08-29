const express = require('express');
const { sql, poolPromise } = require("../config/db");
const authenticateToken = require('../Middleware/auth.middleware');
const router = express.Router();

// GET /notifications - View student notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, req.user.userId)
      .query(`
        SELECT n.notification_id, n.content, n.status, n.type, n.sent_at,
               a.appointment_id, a.date_and_time as appointment_date
        FROM Notification n
        INNER JOIN Appointment a ON n.appointment_id = a.appointment_id
        INNER JOIN Booking b ON a.booking_id = b.booking_id
        WHERE b.student_id = @userId
        ORDER BY n.sent_at DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;