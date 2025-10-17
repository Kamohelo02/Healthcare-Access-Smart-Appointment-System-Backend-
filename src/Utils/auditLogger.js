const { poolPromise } = require('../config/db');

// Logs an audit entry into the AuditLog table
const logAudit = async (userId, logType, message) => {
  const pool = await poolPromise;
  await pool.request()
    .input('userId', userId)
    .input('logType', logType)
    .input('message', message)
    .query(`
      INSERT INTO AuditLog (user_id, log_type, message)
      VALUES (@userId, @logType, @message)
    `);
};

module.exports = { logAudit };

