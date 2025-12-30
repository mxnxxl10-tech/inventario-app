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

async function probarSKU() {
    try {
        const pool = await sql.connect(config);
        
        const sku = 'PT1258AAA';
        
        console.log('\n🔍 Buscando SKU:', sku);
        console.log('='.repeat(60));
        
        // Probar en tabla Producto
        console.log('\n1️⃣ Buscando en tabla Producto:');
        const result1 = await pool.request()
            .input('sku', sql.NVarChar, sku)
            .query('SELECT TOP 5 * FROM Producto WHERE codigo_producto LIKE @sku + ''%''');
        
        console.log('Resultados:', result1.recordset.length);
        if (result1.recordset.length > 0) {
            result1.recordset.forEach(p => {
                console.log(`  - Código: ${p.codigo_producto}, Nombre: ${p.nombre}`);
            });
        }
        
        // Buscar coincidencias parciales
        console.log('\n2️⃣ Buscando códigos similares:');
        const result2 = await pool.request()
            .query(`SELECT TOP 10 codigo_producto, nombre FROM Producto WHERE codigo_producto LIKE 'PT%' ORDER BY codigo_producto`);
        
        console.log('Primeros 10 productos que empiezan con PT:');
        result2.recordset.forEach(p => {
            console.log(`  - ${p.codigo_producto}: ${p.nombre}`);
        });
        
        console.log('\n' + '='.repeat(60));
        await pool.close();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

probarSKU();
