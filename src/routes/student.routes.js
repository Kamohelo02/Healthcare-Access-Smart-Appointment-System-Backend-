const express = require("express");
const router = express.Router();
const studentController = require("../controllers/student.controllerr");
const auth = require("../../middleware/auth.middleware");
const role = require("../middleware/role.middleware");

// auth
router.post("/auth/register", auth, role("student"), studentController.userRegistration);
router.post("/auth/login", auth, role("student"), studentController.userLogin);

//profile
router.get("/profile", auth, role("student"), studentController.getProfile);
router.put("/profile", auth, role("student"), studentController.updateProfile);

//notifications
router.get("/notifications", auth, role("student"), studentController.getNotifications);

//faqs
router.get("/faqs", auth, role("student"), studentController.getFaqs);

module.exports = router;

