require("dotenv").config();

const sql = require("mssql");

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log("✅ Connected to Azure SQL Database");
    return pool;
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });


  
module.exports = { sql, poolPromise };
