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

async function verEstructura() {
    try {
        const pool = await sql.connect(config);
        
        console.log('\n📋 ESTRUCTURA DE TABLA Producto:\n');
        const result = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Producto'
            ORDER BY ORDINAL_POSITION
        `);
        
        result.recordset.forEach(col => {
            console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? '(' + col.CHARACTER_MAXIMUM_LENGTH + ')' : ''})`);
        });
        
        console.log('\n📋 ESTRUCTURA DE TABLA Ubicacion:\n');
        const result2 = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Ubicacion'
            ORDER BY ORDINAL_POSITION
        `);
        
        result2.recordset.forEach(col => {
            console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });
        
        console.log('\n📋 ESTRUCTURA DE TABLA UbicacionProductoInventario:\n');
        const result3 = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'UbicacionProductoInventario'
            ORDER BY ORDINAL_POSITION
        `);
        
        result3.recordset.forEach(col => {
            console.log(`  ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });
        
        await pool.close();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

verEstructura();
