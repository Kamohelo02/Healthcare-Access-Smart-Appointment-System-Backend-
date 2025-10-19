const express = require("express");
const router = express.Router();
const staffController = require("../controllers/staff.controller");
const auth = require("../middleware/auth.middleware");
const role = require("../middleware/role.middleware");

// ==========================
// Staff Schedule Management
// ==========================
router.get("/schedules", auth, role(["staff", "admin", "nurse"]), staffController.getSchedules);
router.post("/schedules", auth, role(["staff", "admin", "nurse"]), staffController.createSchedule);
router.put("/schedules/:id", auth, role(["staff", "admin", "nurse"]), staffController.updateSchedule);
router.delete("/schedules/:id", auth, role(["staff", "admin", "nurse"]), staffController.deleteSchedule);

// ==========================
// Availability Management
// ==========================
router.get("/availability", auth, role(["staff", "admin", "nurse"]), staffController.getAvailability);
router.post("/availability", auth, role(["staff", "admin", "nurse"]), staffController.addAvailability);
router.put("/availability/:id", auth, role(["staff", "admin", "nurse"]), staffController.updateAvailability);
router.delete("/availability/:id", auth, role(["staff", "admin", "nurse"]), staffController.deleteAvailability);

// ==========================
// Appointment Management
// ==========================
router.get("/appointments", auth, role(["staff", "admin", "nurse"]), staffController.getAppointments);
router.get("/appointments/history", auth, role(["staff", "admin", "nurse"]), staffController.getAppointmentHistory);
router.get("/appointments/search", auth, role(["staff", "admin", "nurse"]), staffController.searchAppointments);
router.put("/appointments/:id/status", auth, role(["staff", "admin", "nurse"]), staffController.updateAppointmentStatus);
router.put("/appointments/:id/complete", auth, role(["staff", "admin", "nurse"]), staffController.completeAppointment);

// ==========================
// Booking Management
// ==========================
router.get("/bookings", auth, role(["staff", "admin", "nurse"]), staffController.getBookings);
router.put("/bookings/:id/manage", auth, role(["staff", "admin", "nurse"]), staffController.manageBooking);

// ==========================
// Student Management
// ==========================
router.get("/students", auth, role(["staff", "admin", "nurse"]), staffController.getStudents);
router.get("/students/:id", auth, role(["staff", "admin", "nurse"]), staffController.getStudentProfile);
router.get("/students/:id/appointments", auth, role(["staff", "admin", "nurse"]), staffController.getStudentAppointments);

// ==========================
// Internal Notes
// ==========================
router.get("/appointments/:id/notes", auth, role(["staff", "admin", "nurse"]), staffController.getAppointmentNotes);
router.post("/appointments/:id/notes", auth, role(["staff", "admin", "nurse"]), staffController.addAppointmentNote);

module.exports = router;