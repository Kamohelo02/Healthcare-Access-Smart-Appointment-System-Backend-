const { sql, poolPromise } = require("../config/db");

/* ------------------------ USERS ------------------------ */
exports.getAllUsers = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT u.user_id, u.email, u.phone, u.role, u.account_status, u.created_at,
             s.student_number, st.staff_number, st.position, st.is_admin
      FROM Users u
      LEFT JOIN Student s ON u.user_id = s.user_id
      LEFT JOIN Staff st ON u.user_id = st.user_id
      ORDER BY u.created_at DESC
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send("Server error.");
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, account_status } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("role", sql.NVarChar, role)
      .input("account_status", sql.Bit, account_status)
      .query(`
        UPDATE Users
        SET role=@role, account_status=@account_status
        WHERE user_id=@id
      `);

    if (result.rowsAffected[0] === 0)
      return res.status(404).send("User not found.");

    res.status(200).send("User updated successfully.");
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).send("Server error.");
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM Users WHERE user_id=@id`);

    if (result.rowsAffected[0] === 0)
      return res.status(404).send("User not found.");

    res.status(200).send("User deleted successfully.");
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send("Server error.");
  }
};

/* ------------------------ SYSTEM SETTINGS ------------------------ */
exports.getSettings = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT config_id, config_key, config_value, description, is_active
      FROM SystemConfiguration
      ORDER BY config_key
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("Error fetching settings:", err);
    res.status(500).send("Server error.");
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { config_key, config_value, description, is_active } = req.body;

    const pool = await poolPromise;
    await pool.request()
      .input("config_key", sql.NVarChar, config_key)
      .input("config_value", sql.NVarChar, config_value)
      .input("description", sql.NVarChar, description)
      .input("is_active", sql.Bit, is_active)
      .query(`
        MERGE SystemConfiguration AS target
        USING (SELECT @config_key AS config_key) AS source
        ON target.config_key = source.config_key
        WHEN MATCHED THEN
            UPDATE SET config_value=@config_value, description=@description, is_active=@is_active
        WHEN NOT MATCHED THEN
            INSERT (config_key, config_value, description, is_active)
            VALUES (@config_key, @config_value, @description, @is_active);
      `);

    res.status(200).send("Settings updated successfully.");
  } catch (err) {
    console.error("Error updating settings:", err);
    res.status(500).send("Server error.");
  }
};

/* ------------------------ FAQ MANAGEMENT ------------------------ */
exports.getFaqs = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT faq_id, question, answer, category
      FROM FAQ
      ORDER BY category, question
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("Error fetching FAQs:", err);
    res.status(500).send("Server error.");
  }
};

exports.addFaq = async (req, res) => {
  try {
    const { question, answer, category } = req.body;

    const pool = await poolPromise;
    await pool.request()
      .input("question", sql.NVarChar, question)
      .input("answer", sql.NVarChar, answer)
      .input("category", sql.NVarChar, category)
      .query(`
        INSERT INTO FAQ (question, answer, category, created_at)
        VALUES (@question, @answer, @category, GETDATE())
      `);

    res.status(201).json({ message: "FAQ added successfully." });
  } catch (err) {
    console.error("Error adding FAQ:", err);
    res.status(500).send("Server error.");
  }
};

exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category } = req.body;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("question", sql.NVarChar, question)
      .input("answer", sql.NVarChar, answer)
      .input("category", sql.NVarChar, category)
      .query(`
        UPDATE FAQ
        SET question=@question, answer=@answer, category=@category, updated_at=GETDATE()
        WHERE faq_id=@id
      `);

    if (result.rowsAffected[0] === 0)
      return res.status(404).send("FAQ not found.");

    res.status(200).send("FAQ updated successfully.");
  } catch (err) {
    console.error("Error updating FAQ:", err);
    res.status(500).send("Server error.");
  }
};

exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await poolPromise;
    const result = await pool.request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM FAQ WHERE faq_id=@id`);

    if (result.rowsAffected[0] === 0)
      return res.status(404).send("FAQ not found.");

    res.status(200).send("FAQ deleted successfully.");
  } catch (err) {
    console.error("Error deleting FAQ:", err);
    res.status(500).send("Server error.");
  }
};

/* ------------------------ ANNOUNCEMENTS ------------------------ */
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, admin_id } = req.body;

    const pool = await poolPromise;
    await pool.request()
      .input("title", sql.NVarChar, title)
      .input("content", sql.NVarChar, content)
      .input("admin_id", sql.Int, admin_id)
      .query(`
        INSERT INTO Announcement (title, content, created_at, admin_id)
        VALUES (@title, @content, GETDATE(), @admin_id)
      `);

    res.status(201).json({ message: "Announcement posted successfully." });
  } catch (err) {
    console.error("Error posting announcement:", err);
    res.status(500).send("Server error.");
  }
};
