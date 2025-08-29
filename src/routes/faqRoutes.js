const express = require('express');
const { sql, pool } = require("../config/db");

const router = express.Router();

// GET /faqs - View FAQs
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const pool = getPool();
    
    let query = 'SELECT faq_id, question, answer, category, created_at FROM FAQ';
    const request = pool.request();

    if (category) {
      query += ' WHERE category = @category';
      request.input('category', sql.VarChar, category);
    }

    query += ' ORDER BY created_at DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error('FAQs fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;