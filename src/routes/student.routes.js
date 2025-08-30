const express = require("express");
const router = express.Router();
const studentController = require("../controllers/student.controller");
const auth = require("../middleware/auth.middleware");
const role = require("../middleware/role.middleware");



// Registration & login (NO AUTH NEEDED, these are entry points)
router.post("/auth/register", studentController.userRegistration);
router.post("/auth/login", studentController.userLogin);

// Protected routes (require authentication + student role)
router.get("/profile", auth, role("student"), studentController.getProfile);
router.put("/profile", auth, role("student"), studentController.updateProfile);
router.get("/notifications", auth, role("student"), studentController.getNotifications);

// FAQs (public)
router.get("/faqs", studentController.getFaqs);

module.exports = router;

