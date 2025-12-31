require('dotenv').config();
const sql = require('mssql');

async function main() {
  // Config remoto (Recsolog_wms)
  const configRemoto = {
    server: process.env.DB_HOST_REMOTO,
    port: parseInt(process.env.DB_PORT_REMOTO) || 1433,
    database: process.env.DB_NAME_REMOTO,
    user: process.env.DB_USER_REMOTO,
    password: process.env.DB_PASS_REMOTO,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  };

  // Config local (inventario_app)
  const localUser = process.env.DB_USER_LOCAL;
  const localPass = process.env.DB_PASS_LOCAL;
  const localHost = process.env.DB_HOST_LOCAL && process.env.DB_HOST_LOCAL !== '(local)' ? process.env.DB_HOST_LOCAL : 'localhost';
  const localPort = parseInt(process.env.DB_PORT_LOCAL) || 1433;
  const localDb = process.env.DB_NAME_LOCAL || 'inventario_app';

  const configLocal = localUser ? {
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
    console.log('Conectando a REMOTO...');
    poolR = await sql.connect(configRemoto);
    console.log('✓ Conectado a remoto:', configRemoto.server, configRemoto.database);

    const remotoRes = await poolR.request().query('SELECT * FROM conteo_inventario_web ORDER BY FechaConteo');
    const rows = remotoRes.recordset || [];
    console.log(`Registros remotos encontrados: ${rows.length}`);

    if (rows.length === 0) return process.exit(0);

    console.log('Conectando a LOCAL...');
    poolL = await new sql.ConnectionPool(configLocal).connect();
    console.log('✓ Conectado a local:', localHost, localDb);

    // Agrupar
    const groups = {};
    rows.forEach(r => {
      const key = `${r.IDCuenta || ''}||${r.IDUbicacion || ''}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    let totalInserted = 0;
    const transaction = new sql.Transaction(poolL);
    await transaction.begin();
    try {
      for (const key of Object.keys(groups)) {
        const group = groups[key];
        const first = group[0];

        const insertSession = `
          INSERT INTO SESIONES_CONTEO_FISICO
          (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, fecha_cierre, id_usuario, estado_sesion)
          VALUES ('', '', @nombre_cuenta, @ubicacion, @fecha_inicio, @fecha_inicio, @usuario, 'IMPORTADO');
          SELECT SCOPE_IDENTITY() AS id`;

        const reqSess = new sql.Request(transaction);
        reqSess.input('nombre_cuenta', sql.VarChar, first.IDCuenta || '');
        reqSess.input('ubicacion', sql.VarChar, first.IDUbicacion || '');
        reqSess.input('fecha_inicio', sql.DateTime, first.FechaConteo || new Date());
        reqSess.input('usuario', sql.VarChar, first.Usuario || 'Remoto');

        const sessRes = await reqSess.query(insertSession);
        const id_sesion = sessRes.recordset && sessRes.recordset[0] && (sessRes.recordset[0].id || sessRes.recordset[0].ID) ? (sessRes.recordset[0].id || sessRes.recordset[0].ID) : null;
        if (!id_sesion) throw new Error('No se pudo crear sesión para grupo ' + key);

        for (const r of group) {
          const reqReg = new sql.Request(transaction);
          reqReg.input('id_sesion', sql.Int, id_sesion);
          reqReg.input('id_producto', sql.VarChar, r.IDProducto || r.IDProducto || '');
          reqReg.input('cantidad', sql.Int, (r.CantidadFisica !== undefined && r.CantidadFisica !== null) ? r.CantidadFisica : 0);
          reqReg.input('lote', sql.VarChar, r.LoteProveedor || '');
          reqReg.input('fechaCad', sql.DateTime, r.FechaCaducidad || null);

          await reqReg.query(`INSERT INTO REGISTROS_CONTEO_FISICO (id_sesion, id_producto, cantidad_contada, lote_proveedor_fisico, fechacaducidad_fisica) VALUES (@id_sesion, @id_producto, @cantidad, @lote, @fechaCad)`);
          totalInserted++;
        }
      }

      await transaction.commit();
      console.log(`Sincronización completada. Registros insertados: ${totalInserted}`);
    } catch (e) {
      await transaction.rollback();
      throw e;
    }

    process.exit(0);
  } catch (err) {
    console.error('Error en sincronización:', err.message || err);
    process.exit(1);
  } finally {
    try { if (poolR) await poolR.close(); } catch (e) {}
    try { if (poolL) await poolL.close(); } catch (e) {}
  }
}

main();
