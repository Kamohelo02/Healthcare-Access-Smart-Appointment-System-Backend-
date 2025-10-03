const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const auth = require("../middleware/auth.middleware");
const role = require("../middleware/role.middleware");

// User management
router.get("/users", auth, role("admin"), adminController.getAllUsers);
router.get("/users/search", auth, role("admin"), adminController.searchUsers);
router.get("/users/:id", auth, role("admin"), adminController.getUserById);
router.put("/users/:id", auth, role("admin"), adminController.updateUser); 
router.patch("/users/:id/status", auth, role("admin"), adminController.updateUserStatus); 
router.delete("/users/:id", auth, role("admin"), adminController.deleteUser);

// System settings
router.get("/settings", auth, role("admin"), adminController.getSettings);
router.post("/settings", auth, role("admin"), adminController.updateSettings);

// FAQs
router.get("/faqs", auth, role("admin"), adminController.getFaqs);
router.post("/faqs", auth, role("admin"), adminController.addFaq);
router.put("/faqs/:id", auth, role("admin"), adminController.updateFaq);
router.delete("/faqs/:id", auth, role("admin"), adminController.deleteFaq);

// Announcements
router.get("/announcements", auth, role("admin"), adminController.getAnnouncements);
router.post("/announcements", auth, role("admin"), adminController.createAnnouncement);
router.put("/announcements/:id", auth, role("admin"), adminController.updateAnnouncement);
router.delete("/announcements/:id", auth, role("admin"), adminController.deleteAnnouncement);

console.log("sendNotification type:", typeof adminController.sendNotification);

// Appointments
router.get("/appointments", auth, role("admin"), adminController.getAllAppointments);
router.get("/appointments/search", auth, role(["admin", "staff"]), adminController.searchAppointments);
router.put("/appointments/:id/status", auth, role(["admin", "staff"]), adminController.updateAppointmentStatus);
router.delete("/appointments/:id", auth, role("admin"), adminController.deleteAppointment);

// Analytics
router.get("/analytics/users", auth, role("admin"), adminController.getUserAnalytics);
router.get("/analytics/appointments", auth, role("admin"), adminController.getAppointmentAnalytics);
router.get("/analytics/peak-booking-times", auth, role("admin"), adminController.getPeakBookingTimes);
router.get("/analytics/appointment-metrics", auth, role("admin"), adminController.getAppointmentMetrics);
router.get("/analytics/client-types", auth, role("admin"), adminController.getClientTypes);
router.get("/analytics/monthly-appointments", auth, role("admin"), adminController.getMonthlyAppointments);

// Staff Management
router.get("/staff/schedules", auth, role("admin"), adminController.getStaffSchedules);
router.post("/staff/schedules", auth, role("admin"), adminController.createStaffSchedule);
router.put("/staff/schedules/:id", auth, role("admin"), adminController.updateStaffSchedule);
router.delete("/staff/schedules/:id", auth, role("admin"), adminController.deleteStaffSchedule);

// Feedback Management
router.get("/feedback", auth, role("admin"), adminController.getAllFeedback);
router.put("/feedback/:id/status", auth, role("admin"), adminController.updateFeedbackStatus);

// Reports
router.get("/reports/generate", auth, role("admin"), adminController.generateReport);


// Notification management
router.get("/notifications", auth, role(["admin", "staff"]), adminController.getAllNotifications);
router.get("/notifications/:id", auth, role(["admin", "staff"]), adminController.getNotificationById);
router.put("/notifications/:id/status", auth, role(["admin", "staff"]), adminController.updateNotificationStatus);
router.delete("/notifications/:id", auth, role("admin"), adminController.deleteNotification);

router.post("/send", auth, role(["admin", "staff"]), adminController.sendNotification);


// Bulk operations
router.post("/appointments/bulk-status", auth, role(["admin", "staff"]), adminController.bulkUpdateAppointmentStatus);
router.post("/users/bulk-status", auth, role("admin"), adminController.bulkUpdateUserStatus);


module.exports = router;