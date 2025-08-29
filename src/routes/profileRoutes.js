const express = require('express');
const { sql, poolPromise } = require("../config/db");
const authenticateToken = require('../Middleware/auth.middleware');
const router = express.Router();
 
// GET /profile - View student profile


// PUT /profile - Update student profile


module.exports = router;