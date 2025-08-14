JavaScript

const express = require('express');
const router = express.Router();
const sql = require('mssql');

// Configure your database connection
const config = {
    user: 'sqladminclinic',
    password: '[please request]',
    server: 'your-server-name.database.windows.net',
    database: 'clinic_appointments_db'
};

// Middleware to establish a database connection
const connectDb = async (req, res, next) => {
    try {
        await sql.connect(config);
        next();
    } catch (err) {
        console.error('Database connection failed:', err);
        res.status(500).send('Server error. Could not connect to the database.');
    }
};

// Apply the database connection middleware to all admin routes
router.use(connectDb);

// --- Admin Announcements, Reports, and Oversight ---

// POST /admin/announcements...This endpoint allows an admin to create and post a new announcement.
// Send a new clinic announcement
router.post('/admin/announcements', async (req, res) => {
    try {
        const { title, content, admin_id } = req.body;
        const request = new sql.Request();

        // SQL INSERT to add a new announcement to the Announcement table
        await request.query(`
            INSERT INTO Announcement (title, content, created_at, admin_id)
            VALUES ('${title}', '${content}', GETDATE(), ${admin_id})
        `);

        res.status(201).json({ message: 'Announcement posted successfully.' });
    } catch (err) {
        console.error('Error posting announcement:', err);
        res.status(500).send('Server error.');
    }
});

// GET /admin/faqs
//This endpoint allows an admin to retrieve a list of all existing FAQs.
// View all FAQs
router.get('/admin/faqs', async (req, res) => {
    try {
        const request = new sql.Request();

        // SQL SELECT to retrieve all FAQs from the FAQ table
        const result = await request.query('SELECT faq_id, question, answer, category FROM FAQ');

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching FAQs:', err);
        res.status(500).send('Server error.');
    }
});

// GET /admin/reports
// Generate a basic report (e.g., total users, total bookings)
router.get('/admin/reports', async (req, res) => {
    try {
        const request = new sql.Request();

        const totalUsersResult = await request.query('SELECT COUNT(*) AS TotalUsers FROM Users');
        const totalBookingsResult = await request.query('SELECT COUNT(*) AS TotalBookings FROM Booking');

        const totalUsers = totalUsersResult.recordset[0].TotalUsers;
        const totalBookings = totalBookingsResult.recordset[0].TotalBookings;

        res.status(200).json({ totalUsers, totalBookings });
    } catch (err) {
        console.error('Error generating reports:', err);
        res.status(500).send('Server error.');
    }
});

// GET /admin/logs
// View audit logs for security and compliance
router.get('/admin/logs', async (req, res) => {
    try {
        const request = new sql.Request();

        // SQL SELECT to retrieve all records from the AuditLog table
        const result = await request.query('SELECT * FROM AuditLog ORDER BY logged_time DESC');

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).send('Server error.');
    }
});

// GET /admin/analytics
// View analytics (e.g., popular services)
router.get('/admin/analytics', async (req, res) => {
    try {
        const request = new sql.Request();

        // A basic analytics query to find the most requested service
        const popularServiceResult = await request.query(`
            SELECT TOP 1 service_id, COUNT(*) AS BookingCount
            FROM Booking
            GROUP BY service_id
            ORDER BY BookingCount DESC
        `);
        
        const popularService = popularServiceResult.recordset.length > 0 ? popularServiceResult.recordset[0] : null;

        res.status(200).json({ popularService });
    } catch (err) {
        console.error('Error fetching analytics:', err);
        res.status(500).send('Server error.');
    }
});

// GET /admin/appointments
// View/manage all appointments
router.get('/admin/appointments', async (req, res) => {
    try {
        const request = new sql.Request();

        // SQL SELECT to get all appointments
        const result = await request.query('SELECT * FROM Appointment');

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).send('Server error.');
    }
});

// PUT /admin/appointments/:id
// Update an appointment by its ID
router.put('/admin/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const request = new sql.Request();

        // SQL UPDATE to modify an appointment's status and notes
        const result = await request.query(`
            UPDATE Appointment
            SET status = '${status}', notes = '${notes}'
            WHERE appointment_id = ${id}
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send('Appointment not found.');
        }

        res.status(200).send('Appointment updated successfully.');
    } catch (err) {
        console.error('Error updating appointment:', err);
        res.status(500).send('Server error.');
    }
});

// --- Feedback Moderation ---

// PUT /admin/feedback/:id/approve
// Approve a flagged feedback item by setting its status to 'moderated'
router.put('/admin/feedback/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const request = new sql.Request();

        // SQL UPDATE to change the feedback status
        const result = await request.query(`
            UPDATE Feedback
            SET status = 'moderated'
            WHERE feedback_id = ${id}
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send('Feedback not found.');
        }

        res.status(200).send('Feedback approved successfully.');
    } catch (err) {
        console.error('Error approving feedback:', err);
        res.status(500).send('Server error.');
    }
});

// DELETE /admin/feedback/:id
// Delete a feedback item from the database
router.delete('/admin/feedback/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const request = new sql.Request();

        // SQL DELETE to remove the feedback record
        const result = await request.query(`
            DELETE FROM Feedback
            WHERE feedback_id = ${id}
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).send('Feedback not found.');
        }

        res.status(200).send('Feedback deleted successfully.');
    } catch (err) {
        console.error('Error deleting feedback:', err);
        res.status(500).send('Server error.');
    }
});

module.exports = router;