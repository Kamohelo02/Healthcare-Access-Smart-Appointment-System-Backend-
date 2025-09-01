const { verifyStaffToken } = require('../middleware/authMiddleware');
const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');

//Authentication
router.post('/login', staffController.loginStaff);

//  Scheduling & Availability
router.get('/schedule', verifyStaffToken, staffController.getSchedule);
router.post('/availability', verifyStaffToken, staffController.addAvailability);
router.get('/availability', verifyStaffToken, staffController.getAvailability);

//Appointment Management
router.put('/appointments/manage', verifyStaffToken, staffController.manageAppointment);
router.get('/appointments/history', verifyStaffToken, staffController.getAppointmentHistory);
router.put('/appointments/complete', verifyStaffToken, staffController.markAppointmentComplete);

//Student Info
router.get('/student/:id', verifyStaffToken, staffController.getStudentProfile);

//Messaging
router.post('/messages/send', verifyStaffToken, staffController.sendMessage);

module.exports = router;
