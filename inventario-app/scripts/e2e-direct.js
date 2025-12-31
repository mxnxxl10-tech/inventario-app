require('dotenv').config();
const sql = require('mssql');

async function run() {
  const sku = process.argv[2] || 'PT12313A';
  const ubicacion = process.argv[3] || '22798';
  const cuenta = process.argv[4] || 'Filorga';
  const usuario = process.argv[5] || 'admin';
  const cantidad = parseInt(process.argv[6] || '2');
  const lote = process.argv[7] || 'L1';
  const fechaCad = process.argv[8] || '2026-01-01';

  const cfgRem = {
    server: process.env.DB_HOST_REMOTO,
    port: parseInt(process.env.DB_PORT_REMOTO) || 1433,
    database: process.env.DB_NAME_REMOTO,
    user: process.env.DB_USER_REMOTO,
    password: process.env.DB_PASS_REMOTO,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  };

  const localUser = process.env.DB_USER_LOCAL;
  const localPass = process.env.DB_PASS_LOCAL;
  const localHost = process.env.DB_HOST_LOCAL && process.env.DB_HOST_LOCAL !== '(local)' ? process.env.DB_HOST_LOCAL : 'localhost';
  const localPort = parseInt(process.env.DB_PORT_LOCAL) || 1433;
  const localDb = process.env.DB_NAME_LOCAL || 'inventario_app';

  const cfgLoc = localUser ? {
    server: localHost,
    port: localPort,
    database: localDb,
    user: localUser,
    password: localPass,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  } : {
    server: localHost,
    database: localDb,
    driver: 'msnodesqlv8',
    options: { trustedConnection: true }
  };

  let poolR, poolL;
  try {
    console.log('Conectando a BD remota...');
    poolR = await sql.connect(cfgRem);
    console.log('Conectado a remoto. Buscando SKU:', sku);

    const prodRes = await poolR.request().input('sku', sql.VarChar, sku).query(`
      SELECT TOP 1 * FROM producto WHERE IDProducto = @sku OR IDProducto LIKE '%' + @sku + '%'
    `);

    if (!prodRes.recordset || prodRes.recordset.length === 0) {
      console.log('Producto no encontrado en Recsolog_wms. Abortar.');
      return process.exit(1);
    }

    const prod = prodRes.recordset[0];
    console.log('Producto encontrado:', prod.IDProducto || prod.IDProducto, prod.Nombre || prod.Descripcion || 'Sin nombre');

    console.log('Conectando a BD local...');
    poolL = await new sql.ConnectionPool(cfgLoc).connect();
    console.log('Conectado a local. Insertando sesión y registro...');

    const tx = new sql.Transaction(poolL);
    await tx.begin();
    try {
      const sessReq = new sql.Request(tx);
      sessReq.input('nombre_cuenta', sql.VarChar, cuenta);
      sessReq.input('ubicacion', sql.VarChar, ubicacion);
      sessReq.input('fecha_inicio', sql.DateTime, new Date());
      sessReq.input('usuario', sql.VarChar, usuario);
      const sessQ = `
        INSERT INTO SESIONES_CONTEO_FISICO (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, fecha_cierre, id_usuario, estado_sesion)
        VALUES ('', '', @nombre_cuenta, @ubicacion, @fecha_inicio, @fecha_inicio, @usuario, 'IMPORTADO');
        SELECT SCOPE_IDENTITY() AS id_sesion;
      `;
      const sessR = await sessReq.query(sessQ);
      const id_sesion = sessR.recordset && sessR.recordset[0] && (sessR.recordset[0].id_sesion || sessR.recordset[0].id) ? (sessR.recordset[0].id_sesion || sessR.recordset[0].id) : null;
      if (!id_sesion) throw new Error('No se obtuvo id_sesion');

      const regReq = new sql.Request(tx);
      regReq.input('id_sesion', sql.Int, id_sesion);
      regReq.input('id_producto', sql.VarChar, prod.IDProducto || sku);
      regReq.input('cantidad', sql.Int, cantidad);
      regReq.input('lote', sql.VarChar, lote);
      regReq.input('fechaCad', sql.DateTime, fechaCad);
      await regReq.query(`
        INSERT INTO REGISTROS_CONTEO_FISICO (id_sesion, id_producto, cantidad_contada, lote_proveedor_fisico, fechacaducidad_fisica)
        VALUES (@id_sesion, @id_producto, @cantidad, @lote, @fechaCad)
      `);

      await tx.commit();
      console.log('Inserción completada. id_sesion=', id_sesion);
      process.exit(0);
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (err) {
    console.error('Error E2E directo:', err.message || err);
    process.exit(1);
  } finally {
    try { if (poolR) await poolR.close(); } catch (e) {}
    try { if (poolL) await poolL.close(); } catch (e) {}
  }
}

run();
