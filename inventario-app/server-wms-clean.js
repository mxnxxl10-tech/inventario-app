require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configuración de SQL Server REMOTO (solo lectura)
const configRemoto = {
  server: process.env.DB_HOST_REMOTO,
  port: parseInt(process.env.DB_PORT_REMOTO),
  database: process.env.DB_NAME_REMOTO,
  user: process.env.DB_USER_REMOTO,
  password: process.env.DB_PASS_REMOTO,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  requestTimeout: 60000,
  connectionTimeout: 30000
};

// Configuración de SQL Server LOCAL (escritura)
const configLocal = {
  server: process.env.DB_HOST_LOCAL,
  port: parseInt(process.env.DB_PORT_LOCAL) || 1433,
  database: process.env.DB_NAME_LOCAL,
  user: process.env.DB_USER_LOCAL,
  password: process.env.DB_PASS_LOCAL,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  requestTimeout: 60000,
  connectionTimeout: 30000
};

// Variables para mantener los pools de conexiones
let poolRemoto = null;
let poolLocal = null;

// Función para conectar a la base de datos REMOTA
async function connectRemoto() {
  try {
    if (poolRemoto && poolRemoto.connected) {
      return poolRemoto;
    }
    
    // Cerrar pool existente si hay uno
    if (poolRemoto) {
      try {
        await poolRemoto.close();
      } catch (e) {
        // Ignorar errores
      }
      poolRemoto = null;
    }
    
    console.log('Conectando a SQL Server REMOTO...');
    poolRemoto = await sql.connect(configRemoto);
    console.log('✓ Conectado a SQL Server REMOTO');
    console.log(`  Host: ${configRemoto.server}`);
    console.log(`  Base de datos: ${configRemoto.database}`);
    return poolRemoto;
  } catch (err) {
    console.error('✗ Error al conectar a SQL Server REMOTO:', err.message);
    throw err;
  }
}

// Función para conectar a la base de datos LOCAL
async function connectLocal() {
  try {
    if (poolLocal && poolLocal.connected) {
      return poolLocal;
    }
    
    console.log('Conectando a SQL Server LOCAL...');
    
    if (!process.env.DB_HOST_LOCAL || process.env.DB_HOST_LOCAL.trim() === '') {
      console.log('⚠ No hay configuración para base de datos LOCAL.');
      return null;
    }
    
    if (poolLocal) {
      try {
        await poolLocal.close();
      } catch (e) {
        // Ignorar errores
      }
      poolLocal = null;
    }
    
    const localHost = process.env.DB_HOST_LOCAL && process.env.DB_HOST_LOCAL !== '(local)'
      ? process.env.DB_HOST_LOCAL
      : 'localhost';
    const localPort = parseInt(process.env.DB_PORT_LOCAL) || 1433;
    const localDb = process.env.DB_NAME_LOCAL || 'inventario_app';
    const localUser = process.env.DB_USER_LOCAL;
    const localPass = process.env.DB_PASS_LOCAL;

    let config;
    if (localUser) {
      console.log('Usando autenticación SQL para la base de datos LOCAL');
      
      const isExpressInstance = localHost.toUpperCase().includes('SQLEXPRESS');
      
      config = {
        server: localHost,
        database: localDb,
        user: localUser,
        password: localPass,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
          instanceName: isExpressInstance ? 'SQLEXPRESS' : undefined
        }
      };
      
      if (!isExpressInstance && localPort) {
        config.port = localPort;
      }
    } else {
      console.log('Intentando autenticación Windows para la base de datos LOCAL');
      config = {
        server: localHost,
        database: localDb,
        driver: 'msnodesqlv8',
        options: {
          trustedConnection: true
        }
      };
    }

    poolLocal = new sql.ConnectionPool(config);
    await poolLocal.connect();
    
    console.log('✓ Conectado a SQL Server LOCAL');
    console.log(`  Servidor: ${localHost}`);
    console.log(`  Base de datos: ${localDb}`);
    return poolLocal;
  } catch (err) {
    console.error('✗ Error al conectar a SQL Server LOCAL:', err.message);
    throw err;
  }
}

// Mapeo de cuentas a IDs de compañía
const mapaCuentasInverso = {
  'Montana': [1],
  'Edifier': [5, 10],
  'Liverpool': [7],
  'Fiserv': [8],
  'Glexico': [9],
  'Odella': [15, 18, 19],
  'Filorga': [15, 19],
  'Zaneo': [21],
  'SVR': [15,19]
};

// Mapeo de categorías permitidas por cuenta
const categoriasPorCuenta = {
  'Odella': ['ODELLA OVERNIA', 'ODELLA'],
  'Filorga': ['FILORGA', 'FILORGA OVERNIA'],
  'SVR': ['SVR'],
  'Montana': ['MONTANA'],
  'Edifier': ['EDIFIER', 'EDF'],
  'Liverpool': ['LIVERPOOL'],
  'Fiserv': ['FISERV'],
  'Glexico': ['GLEXICO'],
  'Zaneo': ['ZANEO']
};

// ==================== ENDPOINTS ====================

// Endpoint de autenticación de usuarios
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Usuario y contraseña son requeridos'
      });
    }
    
    const poolLocal = await connectLocal();
    
    const result = await poolLocal.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, password)
      .query(`
        SELECT 
          id_usuario,
          nombre_usuario,
          nombre_completo,
          rol,
          activo
        FROM USUARIOS
        WHERE nombre_usuario = @username 
          AND password_hash = @password
          AND activo = 1
      `);
    
    if (result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Usuario o contraseña incorrectos'
      });
    }
    
    const usuario = result.recordset[0];
    
    await poolLocal.request()
      .input('id_usuario', sql.Int, usuario.id_usuario)
      .query(`
        UPDATE USUARIOS 
        SET fecha_ultimo_acceso = GETDATE()
        WHERE id_usuario = @id_usuario
      `);
    
    res.json({
      success: true,
      usuario: {
        id: usuario.id_usuario,
        username: usuario.nombre_usuario,
        nombreCompleto: usuario.nombre_completo,
        rol: usuario.rol
      }
    });
    
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la solicitud'
    });
  }
});

// Endpoint para validar ubicación
app.post('/api/validar-ubicacion', async (req, res) => {
  try {
    const { ubicacion } = req.body;
    const pool = await connectRemoto();
    
    const result = await pool.request()
      .input('ubicacion', sql.VarChar, ubicacion)
      .query('SELECT * FROM ubicacion WHERE IDUbicacion = @ubicacion');
    
    if (result.recordset.length > 0) {
      res.json({ 
        success: true, 
        data: result.recordset[0] 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Ubicación no encontrada' 
      });
    }
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para validar SKU (con validación de cuenta y categoría)
app.post('/api/validar-sku', async (req, res) => {
  try {
    const { sku, cuenta, ubicacion } = req.body;
    
    if (!cuenta) {
      return res.json({
        success: false,
        message: 'Cuenta no especificada'
      });
    }

    if (!ubicacion) {
      return res.json({
        success: false,
        message: 'Ubicación no especificada'
      });
    }

    const pool = await connectRemoto();
    
    // Verificar que el producto existe y obtener su categoría
    const result = await pool.request()
      .input('sku', sql.VarChar, sku)
      .query('SELECT * FROM Producto WHERE IDProducto = @sku');
    
    if (result.recordset.length === 0) {
      return res.json({ 
        success: false, 
        message: 'SKU no encontrado en el sistema' 
      });
    }

    const producto = result.recordset[0];
    const categoriaProducto = producto.categoria || producto.Categoria || '';
    const variedadProducto = producto.variedad || producto.Variedad || '';
    const especieProducto = producto.especie || producto.Especie || '';

    console.log('=== DEBUG CATEGORÍA ===');
    console.log('SKU:', sku);
    console.log('Categoría:', categoriaProducto);
    console.log('Variedad:', variedadProducto);
    console.log('Especie:', especieProducto);
    console.log('=====================');

    // Validar por categoría primero
    const categoriasPermitidas = categoriasPorCuenta[cuenta] || [];
    let categoriaValida = categoriasPermitidas.some(cat => 
      categoriaProducto.toUpperCase().includes(cat.toUpperCase())
    );

    // Si la categoría no coincide, intentar validar por especie
    if (!categoriaValida && especieProducto) {
      categoriaValida = categoriasPermitidas.some(cat => 
        especieProducto.toUpperCase().includes(cat.toUpperCase())
      );
      
      console.log('Validando por ESPECIE:', categoriaValida);
    }

    if (!categoriaValida && (categoriaProducto || especieProducto)) {
      let cuentaRealPorCategoria = 'Desconocida';
      
      // Buscar primero por categoría
      for (const [nombreCuenta, categorias] of Object.entries(categoriasPorCuenta)) {
        if (categorias.some(cat => categoriaProducto.toUpperCase().includes(cat.toUpperCase()))) {
          cuentaRealPorCategoria = nombreCuenta;
          break;
        }
      }
      
      // Si no se encontró por categoría, buscar por especie
      if (cuentaRealPorCategoria === 'Desconocida' && especieProducto) {
        for (const [nombreCuenta, categorias] of Object.entries(categoriasPorCuenta)) {
          if (categorias.some(cat => especieProducto.toUpperCase().includes(cat.toUpperCase()))) {
            cuentaRealPorCategoria = nombreCuenta;
            break;
          }
        }
      }
      
      return res.json({
        success: false,
        message: `Este SKU pertenece a la cuenta: ${cuentaRealPorCategoria} (Categoría: ${categoriaProducto}${especieProducto ? ', Especie: ' + especieProducto : ''}), no a ${cuenta}`
      });
    }

    // Si la categoría/especie es válida, aceptar el SKU sin validar company ID
    if (categoriaValida) {
      return res.json({ 
        success: true, 
        data: result.recordset[0]
      });
    }
    

    // Validar compañía
    const empresasPermitidas = mapaCuentasInverso[cuenta];
    
    if (!empresasPermitidas) {
      return res.json({
        success: false,
        message: 'Cuenta no válida'
      });
    }

    // Consultar compañías del producto
    const ubicacionSkuQuery = `
      SELECT DISTINCT upi.IDCompania, c.Nombre as NombreCompania
      FROM UbicacionProductoInventario upi
      LEFT JOIN Compania c ON upi.IDCompania = c.IDCompania
      WHERE upi.IDProducto = @sku AND upi.IDUbicacion = @ubicacion
    `;
    
    const ubicacionSkuResult = await pool.request()
      .input('sku', sql.VarChar, sku)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(ubicacionSkuQuery);

    let empresaResult;
    if (ubicacionSkuResult.recordset.length === 0) {
        const inventarioBodegaQuery = `
        SELECT DISTINCT ib.IDCompania, c.Nombre as NombreCompania
        FROM InventarioBodega ib
        LEFT JOIN compania c ON ib.IDCompania = c.IDCompania
        WHERE ib.IDProducto = @sku
    `;
        empresaResult = await pool.request()
            .input('sku', sql.VarChar, sku)
            .query(inventarioBodegaQuery);
    }

    const empresasProducto = empresaResult.recordset.map(r => r.IDCompania);
    const nombresEmpresas = empresaResult.recordset.map(r => r.NombreCompania || '');

    const lotesWMSResult = await poolLocalTemp.request().query(lotesWMSQuery);
    console.log('Registros encontrados en LOTES_WMS_DISPONIBLES:', lotesWMSResult.recordset.length);
    lotesWMSResult.recordset.forEach(lote => {
        const key = `${lote.lote}|${lote.id_producto}|${lote.ubicacion}`;
        if (lote.fechacaducidad) {
            fechasCaducidadWMS[key] = new Date(lote.fechacaducidad).toISOString().split('T')[0];
            console.log(`Fecha WMS mapeada: ${key} -> ${fechasCaducidadWMS[key]}`);
        }
    });
    console.log('Total fechas de caducidad WMS obtenidas:', Object.keys(fechasCaducidadWMS).length);

    // Validar por ID de compañía O por nombre de compañía
    let tienePermiso = empresasProducto.some(emp => empresasPermitidas.includes(emp));


      // Validación adicional por nombre de compañía para casos especiales
      if (!tienePermiso && cuenta === 'Edifier') {
        // Si es Edifier, aceptar también compañías con nombres relacionados
        const nombresEdifier = ['EDIFIER', 'EDF', 'Audífono', 'Audifono'];
        tienePermiso = nombresEmpresas.some(nombre => 
          nombresEdifier.some(edif => nombre.toUpperCase().includes(edif.toUpperCase()))
        );
      }

      console.log('=== DEBUG VALIDACIÓN SKU ===');
      console.log('SKU:', sku);
      console.log('Ubicación:', ubicacion);
      console.log('Cuenta:', cuenta);
      console.log('Empresas del producto (IDs):', empresasProducto);
      console.log('Empresas del producto (Nombres):', nombresEmpresas);
      console.log('Empresas permitidas:', empresasPermitidas);
      console.log('¿Tiene permiso?:', tienePermiso);
      console.log('========================');

      if (tienePermiso) {
        res.json({ 
          success: true, 
          data: result.recordset[0],
          empresas: empresasProducto
        });
      } else {
        let cuentasReales = [];
        for (const [nombreCuenta, empresas] of Object.entries(mapaCuentasInverso)) {
          if (empresasProducto.some(emp => empresas.includes(emp))) {
            cuentasReales.push(nombreCuenta);
          }
        }

        const cuentasTexto = cuentasReales.length > 0 ? cuentasReales.join(', ') : 'Desconocida';

        res.json({ 
          success: false, 
          message: `Este SKU pertenece a: ${cuentasTexto}, no a ${cuenta}` 
        });
      }
      } catch (err) {
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
      }
    });

// Endpoint para obtener información de inventario
app.post('/api/consultar-inventario', async (req, res) => {
    try {
        const { ubicacion, sku, cuentaEsperada } = req.body;
        const pool = await connectRemoto();
        
        const productoQuery = `SELECT * FROM Producto WHERE IDProducto = @sku`;
        const productoResult = await pool.request()
          .input('sku', sql.VarChar, sku)
          .query(productoQuery);
        
        if (productoResult.recordset.length === 0) {
          return res.json({ 
            success: false, 
            message: 'No se encontró el producto con ese SKU' 
          });
        }
        
        console.log('=== DEBUG PRODUCTO ===');
        console.log('Producto completo:', productoResult.recordset[0]);
        console.log('Descripcion:', productoResult.recordset[0].Descripcion);
        console.log('Nombre:', productoResult.recordset[0].Nombre);
        console.log('=====================');
        
        const inventarioQuery = `
          SELECT 
            upi.IDCompania,
            c.Nombre AS Cuenta,
            upi.Cantidad,
            upi.IDUbicacion
          FROM UbicacionProductoInventario upi
          LEFT JOIN Compania c ON upi.IDCompania = c.IDCompania
          WHERE upi.IDProducto = @sku AND upi.IDUbicacion = @ubicacion
        `;
        
        let inventarioResult = await pool.request()
          .input('sku', sql.VarChar, sku)
          .input('ubicacion', sql.VarChar, ubicacion)
          .query(inventarioQuery);
        
        if (inventarioResult.recordset.length === 0) {
          const inventarioBodegaQuery = `
            SELECT TOP 1
              ib.IDCompania,
              c.Nombre AS Cuenta,
              ib.Inventario AS Cantidad,
              NULL AS IDUbicacion
            FROM InventarioBodega ib
            LEFT JOIN Compania c ON ib.IDCompania = c.IDCompania
            WHERE ib.IDProducto = @sku
          `;
          
          inventarioResult = await pool.request()
            .input('sku', sql.VarChar, sku)
            .query(inventarioBodegaQuery);
        }
        
        const ubicacionQuery = `SELECT * FROM Ubicacion WHERE IDUbicacion = @ubicacion`;
        const ubicacionResult = await pool.request()
          .input('ubicacion', sql.VarChar, ubicacion)
          .query(ubicacionQuery);
        
        // Consultar lotes disponibles en el WMS para este SKU en esta ubicación
        const lotesQuery = `
          SELECT DISTINCT c.loteproveedor AS lote, c.FechaCaducidad AS fecha, SUM(c.cantidad) AS cantidad
          FROM CONJUNTO c
          WHERE c.IDProducto = @sku 
            AND c.IDBodega = 1
            AND c.IDUbicacion = @ubicacion
            AND c.idestadocalidad = 'A'
            AND c.idcompania IN ('1','5','8','9','10','15','19','21')
          GROUP BY c.loteproveedor, c.FechaCaducidad
          ORDER BY c.loteproveedor
        `;
        
        const lotesResult = await pool.request()
          .input('sku', sql.VarChar, sku)
          .input('ubicacion', sql.VarChar, ubicacion)
          .query(lotesQuery);
        
        const lotesDisponibles = lotesResult.recordset.map(r => ({
          lote: r.lote || '',
          cantidad: r.cantidad || 0,
          fecha: r.fecha ? new Date(r.fecha).toISOString().split('T')[0] : ''
        }));
        
        const producto = productoResult.recordset[0];
        const inventario = inventarioResult.recordset.length > 0 ? inventarioResult.recordset[0] : null;
        const ubicacionData = ubicacionResult.recordset.length > 0 ? ubicacionResult.recordset[0] : {};
        
        console.log('=== DEBUG PRODUCTO ===');
        console.log('Producto completo:', producto);
        console.log('Descripcion:', producto.Descripcion);
        console.log('Nombre:', producto.Nombre);
        console.log('=====================');
        
        console.log('=== DEBUG UBICACIÓN ===');
        console.log('Ubicación:', ubicacion);
        console.log('Datos ubicación:', ubicacionData);
        console.log('=====================');
        
        const companiasCompartidas = {
          '15 Overnia': ['Odella', 'Filorga', 'SVR'],
          '19 Overnia MKT': ['Odella', 'Filorga', 'SVR']
        };
        
        const mapaCuentas = {
          '1 Montana': 'Montana',
          '5 EDF SOUND & TECHNOLOGY': 'Edifier',
          '7 Liverpool': 'Liverpool',
          '8 Fiserv': 'Fiserv',
          '9 Glexico': 'Glexico',
          '10 Edifier-Viewgraphics': 'Edifier',
          '21 Zaneo Overnia': 'Zaneo',
          '19 SVR': 'SVR',
          'Audífono': 'Edifier',
        };
        
        let cuentaReal = inventario ? (inventario.Cuenta || '') : '';
        let cuentaMapeada;
        
        if (cuentaEsperada && companiasCompartidas[cuentaReal] && companiasCompartidas[cuentaReal].includes(cuentaEsperada)) {
          cuentaMapeada = cuentaEsperada;
        } else {
          cuentaMapeada = mapaCuentas[cuentaReal] || cuentaReal;
        }
        
        const data = {
          sku: producto.IDProducto,
          descripcion: producto.Nombre || 'Sin descripción',
          cuenta: cuentaMapeada,
          ubicacion: inventario ? (inventario.IDUbicacion || ubicacion) : ubicacion,
          pasillo: ubicacionData.IDPasillo || '',
          lado: ubicacionData.IDLado || '',
          pos_x: ubicacionData.PosX || '',
          pos_y: ubicacionData.PosY || '',
          compania: inventario ? (inventario.IDCompania || '') : '',
          especie: producto.Especie || '',
          fechaCaducidadWMS: producto.FechaCaducidad || '',
          cantidad: inventario ? (inventario.Cantidad || 0) : 0,
          esNuevaUbicacion: !inventario || !inventario.IDUbicacion,
          lotes: lotesDisponibles,
          tieneMultiplesLotes: lotesDisponibles.length > 1
        };
        
        res.json({ 
          success: true, 
          data: data
        });
        
      } catch (err) {
        res.status(500).json({ 
          success: false, 
          error: err.message 
        });
      }
    });

// Endpoint para guardar el conteo de inventario
app.post('/api/guardar-conteo', async (req, res) => {
  try {
    const { 
      cuenta, 
      ubicacion, 
      sku, 
      loteProveedor, 
      cantidadFisica, 
      fechaCaducidadWMS,
      fechaCaducidad,
      loteWMS,
      cantidadWMS,
      usuario,
      lotesWMSDisponibles  // Array de todos los lotes disponibles en el WMS
    } = req.body;
    
    console.log('=== DEBUG GUARDAR CONTEO ===');
    console.log('Body recibido:', req.body);
    console.log('Cuenta:', cuenta);
    console.log('Ubicacion:', ubicacion);
    console.log('SKU:', sku);
    console.log('Cantidad Física:', cantidadFisica);
    console.log('Lote Físico:', loteProveedor);
    console.log('Lote WMS:', loteWMS);
    console.log('Cantidad WMS:', cantidadWMS);
    console.log('Fecha:', fechaCaducidad);
    console.log('===========================');
    
    if (poolLocal) {
      try {
        await poolLocal.close();
      } catch (e) {
        console.log('  (Pool ya estaba cerrado)');
      }
      poolLocal = null;
    }
    
    const pool = await connectLocal();
    
    const diagnostic = await pool.request().query('SELECT DB_NAME() AS BaseDatos, @@SERVERNAME AS Servidor');
    console.log('Conectado a:', diagnostic.recordset[0]);
    
    const tablesCheck = await pool.request().query(`
      SELECT COUNT(*) AS existe 
      FROM sys.objects 
      WHERE name IN ('SESIONES_CONTEO_FISICO', 'REGISTROS_CONTEO_FISICO') 
      AND type='U'
    `);
    
    if (tablesCheck.recordset[0].existe < 2) {
      throw new Error('Las tablas SESIONES_CONTEO_FISICO y/o REGISTROS_CONTEO_FISICO no existen.');
    }
    
    // Verificar y agregar columnas lote_wms y cantidad_wms si no existen
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('REGISTROS_CONTEO_FISICO') AND name = 'lote_wms')
        BEGIN
          ALTER TABLE REGISTROS_CONTEO_FISICO ADD lote_wms VARCHAR(50) NULL;
        END
        
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('REGISTROS_CONTEO_FISICO') AND name = 'cantidad_wms')
        BEGIN
          ALTER TABLE REGISTROS_CONTEO_FISICO ADD cantidad_wms INT NULL;
        END
        
        -- Crear tabla para almacenar lotes disponibles del WMS
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE name = 'LOTES_WMS_DISPONIBLES' AND type='U')
        BEGIN
          CREATE TABLE LOTES_WMS_DISPONIBLES (
            id INT IDENTITY(1,1) PRIMARY KEY,
            id_sesion INT NOT NULL,
            id_producto VARCHAR(50) NOT NULL,
            ubicacion VARCHAR(50) NOT NULL,
            lote VARCHAR(50) NULL,
            cantidad INT NULL,
            fecha_caducidad DATE NULL,
            FOREIGN KEY (id_sesion) REFERENCES SESIONES_CONTEO_FISICO(id_sesion)
          );
        END
      `);
    } catch (alterErr) {
      console.log('Error al agregar columnas/tablas (puede ser que ya existan):', alterErr.message);
    }
    
    let fechaSQL = null;
    if (fechaCaducidad && fechaCaducidad.trim() !== '') {
      // Acepta DD/M/AAAA o DD/MM/AAAA
      const match = fechaCaducidad.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        let [_, dia, mes, anio] = match;
        // Asegurar que día y mes tengan 2 dígitos
        dia = dia.padStart(2, '0');
        mes = mes.padStart(2, '0');
        fechaSQL = `${anio}-${mes}-${dia}`;
      } else {
        fechaSQL = fechaCaducidad;
      }
    }
    
    const sqlQuery = `
      DECLARE @id_sesion INT;
      
      INSERT INTO SESIONES_CONTEO_FISICO 
      (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, fecha_cierre, id_usuario, estado_sesion)
      VALUES 
      ('', '', '${cuenta.replace(/'/g, "''")}', '${ubicacion.replace(/'/g, "''")}', GETDATE(), GETDATE(), '${(usuario || 'Sistema').replace(/'/g, "''")}', 'COMPLETADO');
      
      SET @id_sesion = SCOPE_IDENTITY();
      
      INSERT INTO REGISTROS_CONTEO_FISICO
      (id_sesion, id_producto, cantidad_contada, lote_proveedor_fisico, fechacaducidad_fisica, lote_wms, cantidad_wms)
      VALUES
      (@id_sesion, '${sku.replace(/'/g, "''")}', ${cantidadFisica}, '${(loteProveedor || '').replace(/'/g, "''")}', ${fechaSQL ? `'${fechaSQL}'` : 'NULL'}, '${(loteWMS || '').replace(/'/g, "''")}', ${cantidadWMS || 0});
    `;
    
    await pool.request().query(sqlQuery);
    
    // Crear la tabla LOTES_WMS_DISPONIBLES si no existe (sin foreign key para evitar problemas)
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.objects WHERE name = 'LOTES_WMS_DISPONIBLES' AND type='U')
        BEGIN
          CREATE TABLE LOTES_WMS_DISPONIBLES (
            id INT IDENTITY(1,1) PRIMARY KEY,
            id_sesion INT NOT NULL,
            id_producto VARCHAR(50) NOT NULL,
            ubicacion VARCHAR(50) NOT NULL,
            lote VARCHAR(50) NULL,
            cantidad INT NULL,
            fecha_caducidad DATE NULL
          );
          PRINT 'Tabla LOTES_WMS_DISPONIBLES creada';
        END
      `);
    } catch (createErr) {
      console.log('Error al crear tabla LOTES_WMS_DISPONIBLES (puede ser que ya exista):', createErr.message);
    }
    
    // Guardar los lotes disponibles del WMS si fueron enviados
    if (lotesWMSDisponibles && Array.isArray(lotesWMSDisponibles) && lotesWMSDisponibles.length > 0) {
      console.log('=== GUARDANDO LOTES WMS DISPONIBLES ===');
      console.log('Cantidad de lotes:', lotesWMSDisponibles.length);
      
      const sessionResult = await pool.request().query(`
        SELECT TOP 1 id_sesion 
        FROM SESIONES_CONTEO_FISICO 
        WHERE nombre_cuenta = '${cuenta.replace(/'/g, "''")}' 
        AND ubicacion_escaneada = '${ubicacion.replace(/'/g, "''")}' 
        ORDER BY fecha_inicio DESC
      `);
      
      if (sessionResult.recordset.length > 0) {
        const idSesion = sessionResult.recordset[0].id_sesion;
        console.log('ID Sesión:', idSesion);
        
        for (const lote of lotesWMSDisponibles) {
          const fechaLoteSQL = lote.fecha ? `'${lote.fecha}'` : 'NULL';
          console.log(`Guardando lote WMS: ${lote.lote || 'N/A'}, Cantidad: ${lote.cantidad || 0}`);
          await pool.request().query(`
            INSERT INTO LOTES_WMS_DISPONIBLES 
            (id_sesion, id_producto, ubicacion, lote, cantidad, fecha_caducidad)
            VALUES
            (${idSesion}, '${sku.replace(/'/g, "''")}', '${ubicacion.replace(/'/g, "''")}', '${(lote.lote || '').replace(/'/g, "''")}', ${lote.cantidad || 0}, ${fechaLoteSQL})
          `);
        }
        console.log('=== LOTES WMS GUARDADOS CORRECTAMENTE ===');
      }
    } else {
      console.log('No se recibieron lotes del WMS para guardar');
    }
    
    res.json({ 
      success: true, 
      message: 'Conteo guardado exitosamente' 
    });
    
  } catch (err) {
    console.error('Error al guardar conteo:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para consultar conteo guardado
app.post('/api/consultar-conteo-sku', async (req, res) => {
  try {
    const { cuenta, ubicacion, sku } = req.body;
    
    const poolLocal = await connectLocal();
    const result = await poolLocal.request()
      .input('cuenta', sql.VarChar, cuenta)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('sku', sql.VarChar, sku)
      .query(`
        SELECT TOP 1 r.cantidad_contada
        FROM REGISTROS_CONTEO_FISICO r
        INNER JOIN SESIONES_CONTEO_FISICO s ON r.id_sesion = s.id_sesion
        WHERE s.nombre_cuenta = @cuenta 
          AND s.ubicacion_escaneada = @ubicacion
          AND r.id_producto = @sku
        ORDER BY s.fecha_inicio DESC
      `);
    
    if (result.recordset.length > 0) {
      res.json({
        success: true,
        cantidad: result.recordset[0].cantidad_contada
      });
    } else {
      res.json({
        success: false,
        cantidad: 0,
        message: 'No se encontró conteo guardado'
      });
    }
  } catch (err) {
    console.error('Error al consultar conteo:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Endpoint para exportar conteos por periodo
app.get('/api/exportar-conteos-periodo', async (req, res) => {
  let poolLocalTemp = null;
  let poolRemotoTemp = null;
  
  try {
    const { cuenta, fechaInicio, fechaFin, ubicacion } = req.query;
    
    if (!cuenta || !fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'Faltan parámetros: cuenta, fechaInicio y fechaFin son requeridos' });
    }
    
    // Crear una conexión LOCAL especial con timeout extendido
    const configLocalExtendido = {
      ...configLocal,
      requestTimeout: 120000, // 2 minutos
      connectionTimeout: 60000  // 1 minuto
    };
    
    try {
      console.log('Creando conexión LOCAL temporal con timeout de 120 segundos...');
      poolLocalTemp = new sql.ConnectionPool(configLocalExtendido);
      await poolLocalTemp.connect();
      console.log('✓ Conexión LOCAL temporal establecida');
    } catch (err) {
      console.error('Error al conectar LOCAL con timeout extendido:', err);
      poolLocalTemp = await connectLocal(); // Fallback
    }
    
    // Crear una conexión REMOTA especial con timeout extendido para exportación
    const configRemotoExtendido = {
      ...configRemoto,
      requestTimeout: 120000, // 2 minutos
      connectionTimeout: 60000  // 1 minuto
    };
    
    try {
      console.log('Creando conexión temporal con timeout de 120 segundos...');
      poolRemotoTemp = new sql.ConnectionPool(configRemotoExtendido);
      await poolRemotoTemp.connect();
      console.log('✓ Conexión temporal establecida');
    } catch (err) {
      console.error('Error al conectar con timeout extendido:', err);
      poolRemotoTemp = await connectRemoto(); // Fallback a la conexión normal
    }
    
    console.log(`=== EXPORTAR PERIODO ===`);
    console.log(`Cuenta: ${cuenta}`);
    console.log(`Fecha Inicio: ${fechaInicio}`);
    console.log(`Fecha Fin: ${fechaFin}`);
    console.log(`Ubicación: ${ubicacion || 'TODAS'}`);
    console.log(`=======================`);
    
    // Construir query optimizada - TODOS los registros
    let query = `
      SELECT 
        r.id_producto AS SKU,
        r.cantidad_contada AS CantidadFisica,
        r.lote_proveedor_fisico AS Lote,
        r.fechacaducidad_fisica AS FechaCaducidad,
        r.lote_wms AS LoteWMS,
        r.cantidad_wms AS CantidadWMS,
        s.ubicacion_escaneada AS Ubicacion,
        s.fecha_inicio AS FechaConteo,
        s.id_sesion AS IdSesion
      FROM REGISTROS_CONTEO_FISICO r WITH (NOLOCK)
      INNER JOIN SESIONES_CONTEO_FISICO s WITH (NOLOCK) ON r.id_sesion = s.id_sesion
      WHERE s.nombre_cuenta = @cuenta
        AND s.fecha_inicio >= @fechaInicio
        AND s.fecha_inicio < DATEADD(day, 1, @fechaFin)
    `;
    
    if (ubicacion) {
      query += ` AND s.ubicacion_escaneada = @ubicacion`;
    }
    
    query += ` ORDER BY s.fecha_inicio DESC`;
    
    const request = poolLocalTemp.request();
    request.timeout = 120000; // 2 minutos
    request.input('cuenta', sql.VarChar, cuenta)
      .input('fechaInicio', sql.Date, fechaInicio)
      .input('fechaFin', sql.Date, fechaFin);
    
    if (ubicacion) {
      request.input('ubicacion', sql.VarChar, ubicacion);
    }
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return res.json({
        success: false,
        message: 'No hay registros para el periodo seleccionado',
        registros: []
      });
    }

    // Obtener todos los SKUs y ubicaciones únicos
    const skusUnicos = [...new Set(result.recordset.map(r => r.SKU))];
    const ubicacionesUnicas = [...new Set(result.recordset.map(r => r.Ubicacion))];
    
    // Consultar todos los productos de una vez
    const skusList = skusUnicos.map(s => `'${s}'`).join(',');
    const productosResult = await poolRemotoTemp.request()
      .query(`SELECT IDProducto, Nombre, especie FROM Producto WHERE IDProducto IN (${skusList})`);
    
    const productosMap = {};
    productosResult.recordset.forEach(p => {
      productosMap[p.IDProducto] = {
        nombre: p.Nombre || 'Sin descripción',
        especie: p.especie || ''
      };
    });
    
    // Consultar todas las ubicaciones de una vez
    const ubicacionesList = ubicacionesUnicas.map(u => `'${u}'`).join(',');
    const ubicacionesResult = await poolRemotoTemp.request()
      .query(`SELECT IDUbicacion, IDPasillo, IDLado, PosX, PosY FROM Ubicacion WHERE IDUbicacion IN (${ubicacionesList})`);
    
    const ubicacionesMap = {};
    ubicacionesResult.recordset.forEach(u => {
      ubicacionesMap[u.IDUbicacion] = {
        pasillo: u.IDPasillo || '',
        lado: u.IDLado || '',
        posX: u.PosX || '',
        posY: u.PosY || ''
      };
    });
    
    // Consultar CONJUNTO para obtener idcompania y fechacaducidad
    // Incluir tanto lotes WMS (que coincidieron) como lotes físicos (que pueden no coincidir)
    // Ahora incluimos ubicación en la clave para obtener fecha específica por ubicación
    const lotesWMS = [...new Set(result.recordset.filter(r => r.LoteWMS).map(r => `${r.LoteWMS}|${r.SKU}|${r.Ubicacion}`))];
    const lotesFisicos = [...new Set(result.recordset.filter(r => r.Lote).map(r => `${r.Lote}|${r.SKU}|${r.Ubicacion}`))];
    const todosLosLotes = [...new Set([...lotesWMS, ...lotesFisicos])];
    const conjuntoMap = {};
    
    // También crear un mapa de compañía por SKU (para lotes que no existen en WMS)
    const companiaPorSKU = {};
    
    // Crear un mapa de fechas de caducidad WMS desde LOTES_WMS_DISPONIBLES
    const fechasCaducidadWMS = {};
    try {
      const idsesiones = [...new Set(result.recordset.map(r => r.IdSesion))];
      const sesionList = idsesiones.join(',');
      
      console.log('IDs de sesiones para buscar fechas WMS:', sesionList);
      
      const lotesWMSQuery = `
        SELECT id_sesion, id_producto, lote, fecha_caducidad
        FROM LOTES_WMS_DISPONIBLES WITH (NOLOCK)
        WHERE id_sesion IN (${sesionList})
      `;
      
      const lotesWMSResult = await poolLocalTemp.request().query(lotesWMSQuery);
      
      console.log('Registros encontrados en LOTES_WMS_DISPONIBLES:', lotesWMSResult.recordset.length);
      
      lotesWMSResult.recordset.forEach(l => {
        const key = `${l.lote}|${l.id_producto}`;
        if (l.fecha_caducidad) {
          fechasCaducidadWMS[key] = new Date(l.fecha_caducidad).toISOString().split('T')[0];
          console.log(`Fecha WMS mapeada: ${key} -> ${fechasCaducidadWMS[key]}`);
        }
      });
      
      console.log('Total fechas de caducidad WMS obtenidas:', Object.keys(fechasCaducidadWMS).length);
    } catch (err) {
      console.error('Error obteniendo fechas de caducidad WMS:', err.message);
    }
    
    if (skusUnicos.length > 0) {
      for (const sku of skusUnicos) {
        try {
          const companiaResult = await poolRemotoTemp.request()
            .input('sku', sql.VarChar, sku)
            .query(`SELECT TOP 1 idcompania FROM CONJUNTO WHERE idproducto = @sku`);
          
          if (companiaResult.recordset.length > 0) {
            companiaPorSKU[sku] = companiaResult.recordset[0].idcompania || '';
          }
        } catch (err) {
          console.error(`Error consultando compañía para SKU ${sku}:`, err.message);
        }
      }
    }
    
    if (todosLosLotes.length > 0) {
      for (const loteKey of todosLosLotes) {
        const [lote, sku] = loteKey.split('|');
        try {
          const conjuntoResult = await poolRemotoTemp.request()
            .input('lote', sql.VarChar, lote)
            .input('sku', sql.VarChar, sku)
            .query(`SELECT TOP 1 idcompania, fechacaducidad FROM CONJUNTO WHERE loteproveedor = @lote AND idproducto = @sku`);
          
          if (conjuntoResult.recordset.length > 0) {
            conjuntoMap[`${lote}|${sku}`] = {
              compania: conjuntoResult.recordset[0].idcompania || '',
              fechaCaducidad: conjuntoResult.recordset[0].fechacaducidad 
                ? new Date(conjuntoResult.recordset[0].fechacaducidad).toISOString().split('T')[0] 
                : ''
            };
          }
        } catch (err) {
          console.error(`Error consultando CONJUNTO lote ${lote} para SKU ${sku}:`, err.message);
        }
      }
    }
    
    // Procesar los registros usando los mapas
    const registrosProcesados = result.recordset.map(reg => {
      const productoInfo = productosMap[reg.SKU] || { nombre: 'Sin descripción', especie: '' };
      const descripcion = productoInfo.nombre;
      const ubicInfo = ubicacionesMap[reg.Ubicacion] || { pasillo: '', lado: '', posX: '', posY: '' };
      
      // Asociar fecha de caducidad WMS por lote y SKU, tanto para registros físicos como NO CONTADO
      const loteKeyWMS = `${reg.LoteWMS}|${reg.SKU}`;
      const loteKeyFisico = `${reg.Lote}|${reg.SKU}`;
      const conjuntoInfo = conjuntoMap[loteKeyWMS] || conjuntoMap[loteKeyFisico] || { compania: companiaPorSKU[reg.SKU] || '', fechaCaducidad: '' };
      // Buscar fecha de caducidad WMS por lote físico si no hay LoteWMS
      let fechaCaducidadWMS = '';
      if (reg.LoteWMS) {
        fechaCaducidadWMS = fechasCaducidadWMS[loteKeyWMS] || fechasCaducidadWMS[loteKeyFisico] || conjuntoInfo.fechaCaducidad;
      } else if (reg.Lote) {
        fechaCaducidadWMS = fechasCaducidadWMS[loteKeyFisico] || conjuntoInfo.fechaCaducidad;
      } else {
        fechaCaducidadWMS = conjuntoInfo.fechaCaducidad;
      }
      
      const cantidad = reg.CantidadWMS || 0;
      const loteWMS = reg.LoteWMS || '';
      const loteFisico = reg.Lote || '';
      const diferencia = reg.CantidadFisica - cantidad;
     
      let porcentaje = 0;
      let estado = 'OK';
      
      if (cantidad > 0) {
        porcentaje = ((reg.CantidadFisica / cantidad) * 100).toFixed(2);
        if (porcentaje < 100) estado = 'FALTANTE';
        else if (porcentaje > 100) estado = 'SOBRANTE';
      } else {
        porcentaje = reg.CantidadFisica > 0 ? '∞' : '0';
        estado = reg.CantidadFisica > 0 ? 'SOBRANTE' : 'OK';
      }
      
      return {
        sku: reg.SKU,
        descripcion: descripcion,
        ubicacion: reg.Ubicacion,
        pasillo: ubicInfo.pasillo,
        lado: ubicInfo.lado,
        pos_x: ubicInfo.posX,
        pos_y: ubicInfo.posY,
        compania: conjuntoInfo.compania,
        segmento: productoInfo.especie,
        fechaCaducidadWMS: fechaCaducidadWMS,
        cantidad: cantidad,
        cantidad_fisica: reg.CantidadFisica,
        diferencia: diferencia,
        porcentaje: porcentaje,
        estado: estado,
        lote_wms: loteWMS,
        lote: loteFisico,
        fecha_caducidad: reg.FechaCaducidad || '',
        fecha_conteo: reg.FechaConteo ? new Date(reg.FechaConteo).toLocaleDateString('es-MX') : ''
      };
    });
    
    console.log('Registros a enviar (primeros 2):', JSON.stringify(registrosProcesados.slice(0, 2), null, 2));
    
    // AGREGAR LOTES DEL WMS QUE NO FUERON CONTADOS
    // Obtener todos los lotes del WMS que se guardaron en LOTES_WMS_DISPONIBLES
    // Solo tomar el registro más reciente de cada lote para evitar duplicados
    try {
      const lotesWMSQuery = `
        WITH LotesRecientes AS (
          SELECT 
            l.id_producto AS SKU,
            l.ubicacion AS Ubicacion,
            l.lote AS LoteWMS,
            l.cantidad AS CantidadWMS,
            l.fecha_caducidad AS FechaCaducidadWMS,
            ROW_NUMBER() OVER (PARTITION BY l.id_producto, l.ubicacion, l.lote ORDER BY s.fecha_inicio DESC) AS rn
          FROM LOTES_WMS_DISPONIBLES l WITH (NOLOCK)
          INNER JOIN SESIONES_CONTEO_FISICO s WITH (NOLOCK) ON l.id_sesion = s.id_sesion
          WHERE s.nombre_cuenta = @cuenta
            AND s.fecha_inicio >= @fechaInicio
            AND s.fecha_inicio < DATEADD(day, 1, @fechaFin)
            ${ubicacion ? 'AND l.ubicacion = @ubicacion' : ''}
        )
        SELECT 
          SKU,
          Ubicacion,
          LoteWMS,
          CantidadWMS,
          FechaCaducidadWMS
        FROM LotesRecientes
        WHERE rn = 1
      `;
      
      const requestLotes = poolLocalTemp.request();
      requestLotes.input('cuenta', sql.VarChar, cuenta)
        .input('fechaInicio', sql.Date, fechaInicio)
        .input('fechaFin', sql.Date, fechaFin);
      
      if (ubicacion) {
        requestLotes.input('ubicacion', sql.VarChar, ubicacion);
      }
      
      const lotesWMSResult = await requestLotes.query(lotesWMSQuery);
      
      // Crear mapa de compañías para los lotes WMS
      const companiaLotesWMSMap = {};
      if (lotesWMSResult.recordset.length > 0) {
        const lotesUnicos = [...new Set(lotesWMSResult.recordset.map(l => `${l.LoteWMS}|${l.SKU}`))];
        for (const loteKey of lotesUnicos) {
          const [lote, sku] = loteKey.split('|');
          try {
            const conjuntoResult = await poolRemotoTemp.request()
              .input('lote', sql.VarChar, lote)
              .input('sku', sql.VarChar, sku)
              .query(`SELECT TOP 1 idcompania FROM CONJUNTO WHERE loteproveedor = @lote AND idproducto = @sku`);
            
            if (conjuntoResult.recordset.length > 0) {
              companiaLotesWMSMap[loteKey] = conjuntoResult.recordset[0].idcompania || '';
            }
          } catch (err) {
            console.error(`Error consultando CONJUNTO para lote ${lote}:`, err.message);
          }
        }
      }
      
      // Crear un mapa para rastrear qué lotes WMS ya fueron encontrados físicamente
      const lotesWMSEncontradosFisicamente = new Set();
      
      result.recordset.forEach(reg => {
        // Marcar lotes WMS que fueron contados físicamente
        lotesWMSResult.recordset.forEach(loteWMS => {
          if (reg.SKU === loteWMS.SKU && 
              reg.Ubicacion === loteWMS.Ubicacion && 
              reg.Lote && 
              reg.Lote.toUpperCase() === loteWMS.LoteWMS.toUpperCase()) {
            const key = `${loteWMS.SKU}|${loteWMS.Ubicacion}|${loteWMS.LoteWMS}`;
            lotesWMSEncontradosFisicamente.add(key);
          }
        });
      });
      
      console.log('Lotes del WMS encontrados:', lotesWMSResult.recordset.length);
      console.log('Lotes del WMS encontrados físicamente:', lotesWMSEncontradosFisicamente.size);
      
      // Identificar todas las combinaciones SKU+Ubicación que tienen lotes WMS
      const skuUbicacionConLotesWMS = new Set();
      
      for (const loteWMS of lotesWMSResult.recordset) {
        const key = `${loteWMS.SKU}|${loteWMS.Ubicacion}`;
        skuUbicacionConLotesWMS.add(key);
      }
      
      // Agregar TODOS los lotes WMS NO contados físicamente, UNA VEZ por cada SKU+Ubicación
      for (const skuUbicacionKey of skuUbicacionConLotesWMS) {
        const [sku, ubicacion] = skuUbicacionKey.split('|');
        
        // Obtener la fecha del último conteo de este SKU+Ubicación
        const ultimoRegistro = result.recordset.find(r => r.SKU === sku && r.Ubicacion === ubicacion);
        const fechaConteo = ultimoRegistro?.FechaConteo ? new Date(ultimoRegistro.FechaConteo).toLocaleDateString('es-ES') : '';
        
        for (const loteWMS of lotesWMSResult.recordset) {
          const keyLoteWMS = `${loteWMS.SKU}|${loteWMS.Ubicacion}|${loteWMS.LoteWMS}`;
          
          // Solo agregar lotes que son del mismo SKU+Ubicación Y que NO fueron contados
          if (loteWMS.SKU === sku && loteWMS.Ubicacion === ubicacion && !lotesWMSEncontradosFisicamente.has(keyLoteWMS)) {
            const productoInfo = productosMap[loteWMS.SKU] || { nombre: 'Sin descripción', especie: '' };
            const ubicInfo = ubicacionesMap[loteWMS.Ubicacion] || { pasillo: '', lado: '', posX: '', posY: '' };
            
            // Obtener compañía del mapa pre-cargado
            const loteKey = `${loteWMS.LoteWMS}|${loteWMS.SKU}`;
            const compania = companiaLotesWMSMap[loteKey] || '';
            
            const cantidadWMS = loteWMS.CantidadWMS || 0;
            const diferencia = 0 - cantidadWMS;
            
            registrosProcesados.push({
              sku: loteWMS.SKU,
              descripcion: productoInfo.nombre,
              ubicacion: loteWMS.Ubicacion,
              pasillo: ubicInfo.pasillo,
              lado: ubicInfo.lado,
              pos_x: ubicInfo.posX,
              pos_y: ubicInfo.posY,
              compania: compania,
              segmento: productoInfo.especie,
              fechaCaducidadWMS: loteWMS.FechaCaducidadWMS ? new Date(loteWMS.FechaCaducidadWMS).toISOString().split('T')[0] : '',
              cantidad: cantidadWMS,
              cantidad_fisica: 0,
              diferencia: diferencia,
              porcentaje: '0',
              estado: 'NO CONTADO',
              lote_wms: loteWMS.LoteWMS,
              lote: '',
              fecha_caducidad: '',
              fecha_conteo: fechaConteo
            });
          }
        }
      }
    } catch (lotesError) {
      // Si la tabla no existe o hay error, solo registrar y continuar
      console.log('No se pudieron consultar lotes WMS disponibles:', lotesError.message);
      console.log('(Esto es normal si aún no se ha guardado ningún conteo con lotes WMS)');
    }
    
    res.json({
      success: true,
      registros: registrosProcesados,
      total: registrosProcesados.length
    });
    
  } catch (err) {
    console.error('Error en exportar-conteos-periodo:', err);
    res.status(500).json({ error: 'Error al exportar datos del periodo' });
  } finally {
    // SIEMPRE cerrar las conexiones temporales, incluso si hay error
    if (poolRemotoTemp) {
      try {
        await poolRemotoTemp.close();
        console.log('✓ Conexión REMOTA temporal cerrada');
      } catch (e) {
        console.error('Error al cerrar conexión REMOTA temporal:', e.message);
      }
    }
    
    if (poolLocalTemp) {
      try {
        await poolLocalTemp.close();
        console.log('✓ Conexión LOCAL temporal cerrada');
      } catch (e) {
        console.error('Error al cerrar conexión LOCAL temporal:', e.message);
      }
    }
  }
});

// Endpoint para actualizar un registro de conteo
app.post('/api/actualizar-registro', async (req, res) => {
  try {
    const { cuenta, ubicacion, sku, loteOriginal, loteProveedor, cantidadFisica, fechaCaducidad } = req.body;
    
    if (!cuenta || !ubicacion || !sku) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }
    
    console.log(`=== ACTUALIZAR REGISTRO ===`);
    console.log(`Cuenta: ${cuenta}, Ubicación: ${ubicacion}, SKU: ${sku}`);
    console.log(`Lote Original: ${loteOriginal} -> Nuevo: ${loteProveedor}, Cantidad: ${cantidadFisica}`);
    
    // Parsear fecha
    let fechaSQL = null;
    if (fechaCaducidad && fechaCaducidad.trim() !== '') {
      const match = fechaCaducidad.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        let [_, dia, mes, anio] = match;
        fechaSQL = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
    }
    
    const pool = await connectLocal();
    
    // Buscar el registro específico que coincida con SKU, cuenta, ubicación Y lote original
    const buscarRegistroQuery = loteOriginal && loteOriginal.trim() !== ''
      ? `SELECT TOP 1 r.id_registro, r.id_sesion, r.id_producto, r.cantidad_contada, r.lote_proveedor_fisico, r.fechacaducidad_fisica
         FROM REGISTROS_CONTEO_FISICO r WITH (NOLOCK)
         INNER JOIN SESIONES_CONTEO_FISICO s WITH (NOLOCK) ON r.id_sesion = s.id_sesion
         WHERE s.nombre_cuenta = @cuenta 
           AND s.ubicacion_escaneada = @ubicacion
           AND r.id_producto = @sku
           AND UPPER(LTRIM(RTRIM(r.lote_proveedor_fisico))) = UPPER(@lote_original)
         ORDER BY s.fecha_inicio DESC`
      : `SELECT TOP 1 r.id_registro, r.id_sesion, r.id_producto, r.cantidad_contada, r.lote_proveedor_fisico, r.fechacaducidad_fisica
         FROM REGISTROS_CONTEO_FISICO r WITH (NOLOCK)
         INNER JOIN SESIONES_CONTEO_FISICO s WITH (NOLOCK) ON r.id_sesion = s.id_sesion
         WHERE s.nombre_cuenta = @cuenta 
           AND s.ubicacion_escaneada = @ubicacion
           AND r.id_producto = @sku
           AND (r.lote_proveedor_fisico IS NULL OR r.lote_proveedor_fisico = '')
         ORDER BY s.fecha_inicio DESC`;
    
    const registroRequest = pool.request();
    registroRequest.timeout = 60000;
    registroRequest.input('cuenta', sql.VarChar, cuenta);
    registroRequest.input('ubicacion', sql.VarChar, ubicacion);
    registroRequest.input('sku', sql.VarChar, sku);
    
    if (loteOriginal && loteOriginal.trim() !== '') {
      registroRequest.input('lote_original', sql.VarChar, loteOriginal);
    }
    
    const registroResult = await registroRequest.query(buscarRegistroQuery);
    
    if (registroResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: `No se encontró un registro con el lote "${loteOriginal}" para este SKU y ubicación` 
      });
    }
    
    const registro = registroResult.recordset[0];
    console.log('Registro encontrado para actualizar:', registro);
    
    // UPDATE directo usando el id_registro específico
    const updateQuery = `
      UPDATE REGISTROS_CONTEO_FISICO WITH (ROWLOCK)
      SET cantidad_contada = @cantidad,
          lote_proveedor_fisico = @lote_nuevo,
          fechacaducidad_fisica = @fecha
      WHERE id_registro = @id_registro
    `;
    
    const request = pool.request();
    request.timeout = 60000; // 60 segundos
    request.input('id_registro', sql.Int, registro.id_registro)
      .input('lote_nuevo', sql.VarChar, loteProveedor || '')
      .input('cantidad', sql.Int, cantidadFisica || 0)
      .input('fecha', sql.Date, fechaSQL);
    
    const result = await request.query(updateQuery);
    
    console.log(`Registros actualizados: ${result.rowsAffected[0]}`);
    
    // Si la actualización fue exitosa Y hay un lote nuevo, actualizar los datos del WMS
    if (result.rowsAffected[0] > 0 && loteProveedor && loteProveedor.trim() !== '') {
      try {
        const poolRemoto = await connectRemoto();
        
        // Buscar información del lote en el WMS
        const loteWMSQuery = `
          SELECT 
            c.LoteProveedor,
            c.FechaCaducidad,
            SUM(c.Cantidad) as cantidad_wms
          FROM CONJUNTO c
          WHERE c.IDProducto = @sku 
            AND c.LoteProveedor = @lote
            AND c.Ubicacion = @ubicacion
          GROUP BY c.LoteProveedor, c.FechaCaducidad
        `;
        
        const loteWMSResult = await poolRemoto.request()
          .input('sku', sql.VarChar, sku)
          .input('lote', sql.VarChar, loteProveedor)
          .input('ubicacion', sql.VarChar, ubicacion)
          .query(loteWMSQuery);
        
        if (loteWMSResult.recordset.length > 0) {
          const loteWMS = loteWMSResult.recordset[0];
          
          // Actualizar el registro con los datos del WMS - usar id_registro directo
          await pool.request()
            .input('id_registro', sql.Int, registro.id_registro)
            .input('lote_wms', sql.VarChar, loteWMS.LoteProveedor)
            .input('cantidad_wms', sql.Int, loteWMS.cantidad_wms || 0)
            .input('fecha_wms', sql.Date, loteWMS.FechaCaducidad)
            .query(`
              UPDATE REGISTROS_CONTEO_FISICO WITH (ROWLOCK)
              SET lote_wms = @lote_wms,
                  cantidad_wms = @cantidad_wms
              WHERE id_registro = @id_registro
            `);
          
          console.log('✓ Datos del WMS actualizados en el registro');
        } else {
          // Si no existe en el WMS, limpiar los datos WMS - usar id_registro directo
          await pool.request()
            .input('id_registro', sql.Int, registro.id_registro)
            .query(`
              UPDATE REGISTROS_CONTEO_FISICO WITH (ROWLOCK)
              SET lote_wms = NULL,
                  cantidad_wms = NULL
              WHERE id_registro = @id_registro
            `);
          
          console.log('⚠ Lote no encontrado en WMS, datos WMS limpiados');
        }
      } catch (wmsError) {
        console.error('Error al actualizar datos del WMS:', wmsError.message);
        // No fallar la actualización si solo falla la parte del WMS
      }
    }
    
    res.json({
      success: true,
      message: 'Registro actualizado correctamente',
      rowsAffected: result.rowsAffected[0]
    });
    
  } catch (err) {
    console.error('Error al actualizar registro:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Error al actualizar el registro',
      details: err.message
    });
  }
});

// ==================== INICIO DEL SERVIDOR ====================

app.listen(PORT, async () => {
  console.log(`\n=================================`);
  console.log(`Servidor iniciado en puerto ${PORT}`);
  console.log(`=================================\n`);
  
  try {
    await connectRemoto();
    await connectLocal();
    console.log('\n✓ Listo para procesar solicitudes\n');
  } catch (err) {
    console.error('Error al conectar a las bases de datos');
  }
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\nCerrando servidor...');
  if (poolRemoto) {
    await poolRemoto.close();
  }
  if (poolLocal) {
    await poolLocal.close();
  }
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
});


process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err);
});

