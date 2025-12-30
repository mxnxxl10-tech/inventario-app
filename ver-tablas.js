const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function verTablas() {
    try {
        const pool = await sql.connect(config);
        
        console.log('\n📋 TABLAS DISPONIBLES:\n');
        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            ORDER BY TABLE_NAME
        `);
        
        result.recordset.forEach(r => {
            console.log('  ✓', r.TABLE_NAME);
        });
        
        console.log('\n');
        await pool.close();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

verTablas();
