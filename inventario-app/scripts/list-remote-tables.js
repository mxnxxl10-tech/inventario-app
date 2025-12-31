require('dotenv').config();
const sql = require('mssql');

async function listTables() {
  const configRemoto = {
    server: process.env.DB_HOST_REMOTO,
    port: parseInt(process.env.DB_PORT_REMOTO) || 1433,
    database: process.env.DB_NAME_REMOTO,
    user: process.env.DB_USER_REMOTO,
    password: process.env.DB_PASS_REMOTO,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  };
  let pool;
  try {
    pool = await sql.connect(configRemoto);
    const res = await pool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.log('Tablas en la BD remota:');
    res.recordset.forEach(r => console.log(`${r.TABLE_SCHEMA}.${r.TABLE_NAME}`));
    process.exit(0);
  } catch (err) {
    console.error('Error listando tablas remotas:', err.message || err);
    process.exit(1);
  } finally { try { if (pool) await pool.close(); } catch (e) {} }
}

listTables();
