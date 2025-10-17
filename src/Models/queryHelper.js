const { poolPromise } = require('../config/db');

async function runQuery(query, params = []) {
  const pool = await poolPromise;
  const request = pool.request();
  params.forEach(p => request.input(p.name, p.type, p.value));
  return request.query(query);
}

module.exports = { runQuery };
