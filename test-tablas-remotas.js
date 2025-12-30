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

async function verificarTablas() {
    try {
        console.log('🔌 Conectando al servidor remoto...');
        await sql.connect(config);
        console.log('✅ Conectado\n');

        // Listar todas las tablas
        console.log('📋 TABLAS EN LA BASE DE DATOS:\n');
        const tablas = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `;
        
        tablas.recordset.forEach(t => {
            console.log('   -', t.TABLE_NAME);
        });

        // Verificar estructura de tabla Producto
        console.log('\n📊 ESTRUCTURA DE TABLA Producto:\n');
        const columnasProducto = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Producto'
            ORDER BY ORDINAL_POSITION
        `;
        
        columnasProducto.recordset.forEach(c => {
            console.log(`   - ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''})`);
        });

        // Ver si hay tabla de Compañía
        console.log('\n🏢 BUSCANDO TABLA DE COMPAÑÍAS:\n');
        const compania = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%Compan%' OR TABLE_NAME LIKE '%Company%' OR TABLE_NAME LIKE '%Marca%'
        `;
        
        if (compania.recordset.length > 0) {
            compania.recordset.forEach(t => {
                console.log('   ✅ Encontrada:', t.TABLE_NAME);
            });
        } else {
            console.log('   ⚠️  No se encontró tabla de compañías');
        }

        // Probar consulta con un SKU de ejemplo
        console.log('\n🔍 PROBANDO CONSULTA CON SKU PT12298AAA:\n');
        const test = await sql.query`
            SELECT TOP 1 
                p.IDProducto,
                p.Nombre,
                p.*
            FROM Producto p
            WHERE p.IDProducto = 'PT12298AAA'
        `;
        
        if (test.recordset.length > 0) {
            console.log(JSON.stringify(test.recordset[0], null, 2));
        }

        await sql.close();
        console.log('\n✅ Completado');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

verificarTablas();
