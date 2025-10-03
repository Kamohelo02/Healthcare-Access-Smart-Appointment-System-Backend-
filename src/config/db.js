const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: true, // For Google Cloud SQL
    enableArithAbort: true,
    trustServerCertificate: true, // Add this for Google Cloud SQL
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// For Google Cloud SQL with private IP (alternative configuration)
const dbConfigCloudSQL = {
  server: process.env.INSTANCE_CONNECTION_NAME, // If using connection name
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    enableArithAbort: true,
    trustServerCertificate: true,
  }
};

let poolPromise;

try {
  poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
      console.log('✅ Connected to Google Cloud SQL Database');
      return pool;
    })
    .catch(err => {
      console.error('❌ Database connection failed:', err.message);
      // Try alternative config if primary fails
      if (process.env.INSTANCE_CONNECTION_NAME) {
        return new sql.ConnectionPool(dbConfigCloudSQL)
          .connect()
          .then(pool => {
            console.log('✅ Connected to Google Cloud SQL using instance name');
            return pool;
          });
      }
      throw err;
    });
} catch (err) {
  console.error('❌ Database configuration error:', err);
}

module.exports = {
  sql,
  poolPromise
};

