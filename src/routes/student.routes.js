const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const studentController = require("../controllers/student.controller");
const role = require("../middleware/role.middleware");


// Auth required for all student routes
router.get("/profile", auth, studentController.getProfile);
router.put("/profile", auth, studentController.updateProfile);

// fetching appointments & notification
router.get("/notifications", auth, studentController.getNotifications);
router.get("/faqs", auth, studentController.getFaqs);

// Appointments
router.post("/appointments", auth, studentController.bookAppointment);
router.get("/appointments", auth, studentController.getMyAppointments);
router.put("/appointments/:id", auth, studentController.rescheduleAppointment);
router.delete("/appointments/:id", auth, studentController.cancelAppointment);

// Feedback
router.post("/feedback", auth, studentController.submitFeedback);

module.exports = router;
