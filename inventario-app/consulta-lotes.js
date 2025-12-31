require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_HOST_REMOTO,
  port: parseInt(process.env.DB_PORT_REMOTO),
  database: process.env.DB_NAME_REMOTO,
  user: process.env.DB_USER_REMOTO,
  password: process.env.DB_PASS_REMOTO,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function consultarLotes() {
  try {
    const pool = await sql.connect(config);
    
    const result = await pool.query(`
      SELECT 
        c.loteproveedor AS lote,
        c.IDUbicacion as ubicacion,
        SUM(c.cantidad) AS cantidad,
        COUNT(*) as num_registros
      FROM CONJUNTO c
      WHERE c.IDProducto = 'PT10295AAA'
        AND c.IDBodega = 1
        AND c.idestadocalidad = 'A'
        AND c.idcompania IN ('1','5','8','9','10','15','19','21')
      GROUP BY c.loteproveedor, c.IDUbicacion
      ORDER BY c.loteproveedor, c.IDUbicacion
    `);

    console.log('\n===========================================');
    console.log('Lotes del SKU PT10295AAA en Bodega 1:');
    console.log('===========================================\n');
    
    result.recordset.forEach(r => {
      console.log(`  Lote: ${r.lote}, Ubicación: ${r.ubicacion}, Cantidad: ${r.cantidad}, Registros: ${r.num_registros}`);
    });
    
    console.log('\n===========================================');
    console.log(`Total: ${result.recordset.length} combinaciones lote-ubicación`);
    console.log('===========================================\n');

    // Agrupar solo por lote
    const resultPorLote = await pool.query(`
      SELECT 
        c.loteproveedor AS lote,
        SUM(c.cantidad) AS cantidad_total,
        COUNT(DISTINCT c.IDUbicacion) as ubicaciones,
        COUNT(*) as num_registros
      FROM CONJUNTO c
      WHERE c.IDProducto = 'PT10295AAA'
        AND c.IDBodega = 1
        AND c.idestadocalidad = 'A'
        AND c.idcompania IN ('1','5','8','9','10','15','19','21')
      GROUP BY c.loteproveedor
      ORDER BY c.loteproveedor
    `);

    console.log('Resumen por lote:');
    console.log('===========================================\n');
    
    resultPorLote.recordset.forEach(r => {
      console.log(`  Lote: ${r.lote}`);
      console.log(`    Cantidad total: ${r.cantidad_total}`);
      console.log(`    En ${r.ubicaciones} ubicación(es)`);
      console.log(`    ${r.num_registros} registro(s) en CONJUNTO`);
      console.log('');
    });
    
    console.log('===========================================');
    console.log(`Total de lotes diferentes: ${resultPorLote.recordset.length}`);
    console.log('===========================================\n');

    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

consultarLotes();
