const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const auth = require("../../middleware/auth.middleware");
const role = require("../middleware/role.middleware");

// User management
router.get("/users", auth, role("admin"), adminController.getAllUsers);
router.put("/users/:id", auth, role("admin"), adminController.updateUser);
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
router.post("/announcements", auth, role("admin"), adminController.createAnnouncement);

module.exports = router;
