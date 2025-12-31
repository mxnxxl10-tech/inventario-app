require('dotenv').config();
const sql = require('mssql');

async function main() {
  const cfg = {
    server: process.env.DB_HOST_REMOTO,
    port: parseInt(process.env.DB_PORT_REMOTO) || 1433,
    database: process.env.DB_NAME_REMOTO,
    user: process.env.DB_USER_REMOTO,
    password: process.env.DB_PASS_REMOTO,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  };
  let pool;
  try {
    pool = await sql.connect(cfg);
    const res = await pool.request().query('SELECT TOP 20 * FROM dbo.Usuario');
    console.log('Columnas y primeras filas de dbo.Usuario:');
    console.table(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error('Error consultando dbo.Usuario:', err.message || err);
    process.exit(1);
  } finally {
    try { if (pool) await pool.close(); } catch (e) {}
  }
}

main();
