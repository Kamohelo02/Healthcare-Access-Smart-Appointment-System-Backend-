const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// Import routes
const adminRoutes = require("./src/routes/admin.routes");
app.use("/admin", adminRoutes);

//Students routes imports
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const faqRoutes = require('./routes/faqRoutes');

// Students
app.use('/auth', authRoutes);
app.use('/profile', profileRoutes);
app.use('/notifications', notificationRoutes);
app.use('/faqs', faqRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

