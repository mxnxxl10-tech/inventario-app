require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Servir archivos estáticos

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
  }
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
  }
};

// Variables para mantener los pools de conexiones
let poolRemoto = null;
let poolLocal = null;

// Función para conectar a la base de datos REMOTA (consultas)
async function connectRemoto() {
  try {
    if (poolRemoto) {
      return poolRemoto;
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

// Función para conectar a la base de datos LOCAL (escritura)
async function connectLocal() {
  try {
    if (poolLocal && poolLocal.connected) {
      console.log('  ↳ Reutilizando pool LOCAL existente');
      return poolLocal;
    }
    
    console.log('Conectando a SQL Server LOCAL...');
    
    // Verificar si hay configuración local
    if (!process.env.DB_HOST_LOCAL || process.env.DB_HOST_LOCAL.trim() === '') {
      console.log('⚠ No hay configuración para base de datos LOCAL. Saltando conexión.');
      return null;
    }
    
    // Si el pool existe pero no está conectado, cerrarlo
    if (poolLocal) {
      try {
        await poolLocal.close();
      } catch (e) {
        // Ignorar errores
      }
      poolLocal = null;
    }
    
    // Preferir configuración desde variables de entorno
    const localHost = process.env.DB_HOST_LOCAL && process.env.DB_HOST_LOCAL !== '(local)'
      ? process.env.DB_HOST_LOCAL
      : 'localhost';
    const localPort = parseInt(process.env.DB_PORT_LOCAL) || 1433;
    const localDb = process.env.DB_NAME_LOCAL || 'inventario_app';
    const localUser = process.env.DB_USER_LOCAL;
    const localPass = process.env.DB_PASS_LOCAL;

    let config;
    if (localUser) {
      // Usar autenticación SQL si se proporciona usuario en .env
      console.log('Usando autenticación SQL para la base de datos LOCAL');
      
      // Si es SQL Express, no especificar puerto y dejar que use Named Pipes
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
      
      // Solo agregar puerto si no es una instancia nombrada
      if (!isExpressInstance && localPort) {
        config.port = localPort;
      }
    } else {
      // Intentar autenticación Windows (trusted) vía msnodesqlv8 si no hay usuario
      console.log('No se encontró usuario en .env. Intentando autenticación Windows (trusted) para la base de datos LOCAL');
      config = {
        server: localHost,
        database: localDb,
        driver: 'msnodesqlv8',
        options: {
          trustedConnection: true
        }
      };
    }

    // Crear un nuevo pool explícitamente
    poolLocal = new sql.ConnectionPool(config);
    await poolLocal.connect();
    
    console.log('✓ Conectado a SQL Server LOCAL');
    console.log(`  Servidor: DESKTOP-LAETL0R`);
    console.log(`  Base de datos: inventario_app`);
    return poolLocal;
  } catch (err) {
    console.error('✗ Error al conectar a SQL Server LOCAL:', err.message);
    throw err;
  }
}

// Mapeo de cuentas a IDs de compañía (para validación de SKU)
const mapaCuentasInverso = {
  'Montana': [1],
  'Edifier': [5, 10],
  'Liverpool': [7],
  'Fiserv': [8],
  'Glexico': [9],
  'Odella': [15, 18, 19],
  'Filorga': [15, 19],
  'Zaneo': [21],
  'SVR': [39]
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
    
    // Buscar usuario en la base de datos
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
    
    // Actualizar fecha de último acceso
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

// Endpoint para validar SKU (con validación de cuenta)
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
    
    // Primero verificar que el producto existe y obtener su categoría
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

    // LOG DEBUG - Ver la categoría
    console.log('=== DEBUG CATEGORÍA ===');
    console.log('SKU:', sku);
    console.log('Categoría:', categoriaProducto);
    console.log('=====================');

    // Validar por categoría primero (más específico)
    const categoriasPermitidas = categoriasPorCuenta[cuenta] || [];
    const categoriaValida = categoriasPermitidas.some(cat => 
      categoriaProducto.toUpperCase().includes(cat.toUpperCase())
    );

    if (!categoriaValida && categoriaProducto) {
      // Buscar a qué cuenta pertenece por categoría
      let cuentaRealPorCategoria = 'Desconocida';
      for (const [nombreCuenta, categorias] of Object.entries(categoriasPorCuenta)) {
        if (categorias.some(cat => categoriaProducto.toUpperCase().includes(cat.toUpperCase()))) {
          cuentaRealPorCategoria = nombreCuenta;
          break;
        }
      }
      
      return res.json({
        success: false,
        message: `Este SKU pertenece a la cuenta: ${cuentaRealPorCategoria} (Categoría: ${categoriaProducto}), no a ${cuenta}`
      });
    }

    // Ahora validar que el SKU pertenece a la cuenta seleccionada
    const empresasPermitidas = mapaCuentasInverso[cuenta];
    
    if (!empresasPermitidas) {
      return res.json({
        success: false,
        message: 'Cuenta no válida'
      });
    }

    // Consultar el SKU en la ubicación específica para validar la compañía
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

    // Si no se encuentra en UbicacionProductoInventario, buscar en InventarioBodega
    let empresaResult;
    if (ubicacionSkuResult.recordset.length === 0) {
      const empresaQuery = `
        SELECT DISTINCT ib.IDCompania, c.Nombre as NombreCompania
        FROM InventarioBodega ib
        LEFT JOIN Compania c ON ib.IDCompania = c.IDCompania
        WHERE ib.IDProducto = @sku
      `;
      
      empresaResult = await pool.request()
        .input('sku', sql.VarChar, sku)
        .query(empresaQuery);
    } else {
      empresaResult = ubicacionSkuResult;
    }

    if (empresaResult.recordset.length === 0) {
      return res.json({
        success: false,
        message: 'SKU no tiene inventario registrado'
      });
    }

    // Verificar si alguna de las compañías del producto está en las permitidas
    const empresasProducto = empresaResult.recordset.map(r => r.IDCompania);
    const tienePermiso = empresasProducto.some(emp => empresasPermitidas.includes(emp));

    // LOG DEBUG
    console.log('=== DEBUG VALIDACIÓN SKU ===');
    console.log('SKU:', sku);
    console.log('Ubicación:', ubicacion);
    console.log('Cuenta:', cuenta);
    console.log('Datos de compañías del producto:');
    empresaResult.recordset.forEach(r => {
      console.log(`  - IDCompania: ${r.IDCompania}, Nombre: ${r.NombreCompania}`);
    });
    console.log('Empresas permitidas para', cuenta + ':', empresasPermitidas);
    console.log('¿Tiene permiso?:', tienePermiso);
    console.log('Búsqueda en ubicación específica:', ubicacionSkuResult.recordset.length > 0 ? 'SÍ' : 'NO');
    console.log('========================');

    if (tienePermiso) {
      res.json({ 
        success: true, 
        data: result.recordset[0],
        empresas: empresasProducto
      });
    } else {
      // Buscar a qué cuenta pertenece realmente
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

// Endpoint para obtener información completa de ubicación y SKU
app.post('/api/consultar-inventario', async (req, res) => {
  try {
    const { ubicacion, sku, cuentaEsperada } = req.body;
    const pool = await connectRemoto();
    
    // Primero verificar que el producto existe
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
    
    // Buscar el inventario con la cuenta para esa ubicación específica
    // Primero intentar en UbicacionProductoInventario, luego en InventarioBodega
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
    
    // Si no hay resultados, buscar en InventarioBodega (pero sin ubicación específica)
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
        .input('ubicacion', sql.VarChar, ubicacion)
        .query(inventarioBodegaQuery);
    }
    
    // Buscar información de la ubicación
    const ubicacionQuery = `SELECT * FROM Ubicacion WHERE IDUbicacion = @ubicacion`;
    const ubicacionResult = await pool.request()
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(ubicacionQuery);
    
    const producto = productoResult.recordset[0];
    const inventario = inventarioResult.recordset.length > 0 ? inventarioResult.recordset[0] : null;
    const ubicacionData = ubicacionResult.recordset.length > 0 ? ubicacionResult.recordset[0] : {};
    
    // Mapeo de nombres de cuenta de la BD a nombres locales/personalizados
    // Nota: Odella, Filorga y SVR comparten productos de compañías 15 y 19
    // Nota: Edifier incluye productos de compañías 5 y 10
    // Nota: Zaneo es cuenta independiente (compañía 21)
    
    // Compañías compartidas entre múltiples cuentas
    const companiasCompartidas = {
      '15 Overnia': ['Odella', 'Filorga', 'SVR'],
      '19 Overnia MKT': ['Odella', 'Filorga', 'SVR']
    };
    
    const mapaCuentas = {
      '1 Montana': 'Montana',
      '2 CESB': 'CESB',
      '5 EDF SOUND & TECHNOLOGY': 'Edifier',
      '7 Liverpool': 'Liverpool',
      '8 Fiserv': 'Fiserv',
      '9 Glexico': 'Glexico',
      '10 Edifier-Viewgraphics': 'Edifier',
      '21 Zaneo Overnia': 'Zaneo',
      '39 SVR': 'SVR'
    };
    
    let cuentaReal = inventario ? (inventario.Cuenta || '') : '';
    let cuentaMapeada;
    
    // Si la compañía es compartida y tenemos cuenta esperada, usar la cuenta esperada
    if (cuentaEsperada && companiasCompartidas[cuentaReal] && companiasCompartidas[cuentaReal].includes(cuentaEsperada)) {
      cuentaMapeada = cuentaEsperada;
    } else {
      // Intentar mapear al nombre local, si no existe, usar el nombre original
      cuentaMapeada = mapaCuentas[cuentaReal] || cuentaReal;
    }
    
    // Combinar datos con los campos correctos
    const data = {
      sku: producto.IDProducto,
      descripcion: producto.Nombre || producto.Descripcion || 'Sin descripción',
      cuenta: cuentaMapeada,
      ubicacion: inventario ? (inventario.IDUbicacion || ubicacion) : ubicacion,  // Devolver la ubicación ingresada si no está registrada
      pasillo: ubicacionData.IDPasillo || '',
      lado: ubicacionData.IDLado || '',
      pos_x: ubicacionData.PosX || '',
      pos_y: ubicacionData.PosY || '',
      cantidad: inventario ? (inventario.Cantidad || 0) : 0,
      esNuevaUbicacion: !inventario || !inventario.IDUbicacion  // Indicar si es una ubicación nueva
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
      fechaCaducidad,
      usuario 
    } = req.body;
    
    // FORZAR cierre del pool local si existe para evitar reutilizar el remoto
    if (poolLocal) {
      try {
        await poolLocal.close();
      } catch (e) {
        console.log('  (Pool ya estaba cerrado)');
      }
      poolLocal = null;
    }
    
    const pool = await connectLocal();
    
    // Diagnóstico: ver dónde estamos conectados
    const diagnostic = await pool.request().query('SELECT DB_NAME() AS BaseDatos, @@SERVERNAME AS Servidor');
    console.log('Conectado a:', diagnostic.recordset[0]);
    
    // Verificar si las tablas existen
    const tablesCheck = await pool.request().query(`
      SELECT COUNT(*) AS existe 
      FROM sys.objects 
      WHERE name IN ('SESIONES_CONTEO_FISICO', 'REGISTROS_CONTEO_FISICO') 
      AND type='U'
    `);
    
    if (tablesCheck.recordset[0].existe < 2) {
      throw new Error('Las tablas SESIONES_CONTEO_FISICO y/o REGISTROS_CONTEO_FISICO no existen. Contacta al administrador para crearlas.');
    }
    
    // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD para SQL Server
    let fechaSQL = null;
    if (fechaCaducidad && fechaCaducidad.trim() !== '') {
      const match = fechaCaducidad.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (match) {
        const [_, dia, mes, anio] = match;
        fechaSQL = `${anio}-${mes}-${dia}`;
      } else {
        // Si ya viene en formato YYYY-MM-DD del calendario
        fechaSQL = fechaCaducidad;
      }
    }
    
    // Usar tablas sin prefijo
    const sqlQuery = `
      DECLARE @id_sesion INT;
      
      INSERT INTO SESIONES_CONTEO_FISICO 
      (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, fecha_cierre, id_usuario, estado_sesion)
      VALUES 
      ('', '', '${cuenta.replace(/'/g, "''")}', '${ubicacion.replace(/'/g, "''")}', GETDATE(), GETDATE(), '${(usuario || 'Sistema').replace(/'/g, "''")}', 'COMPLETADO');
      
      SET @id_sesion = SCOPE_IDENTITY();
      
      INSERT INTO REGISTROS_CONTEO_FISICO
      (id_sesion, id_producto, cantidad_contada, lote_proveedor_fisico, fechacaducidad_fisica)
      VALUES
      (@id_sesion, '${sku.replace(/'/g, "''")}', ${cantidadFisica}, '${(loteProveedor || '').replace(/'/g, "''")}', ${fechaSQL ? `'${fechaSQL}'` : 'NULL'});
      
      SELECT 'OK' AS resultado;
    `;
    
    await pool.request().query(sqlQuery);
    
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

// Endpoint para obtener historial de conteos
app.get('/api/historial-conteos', async (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Historial no disponible. Base de datos local no configurada.'
  });
});

// Endpoint para actualizar un conteo existente
app.put('/api/actualizar-conteo/:id', async (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Actualización no disponible. Base de datos local no configurada.'
  });
});

// Endpoint para eliminar un conteo
app.delete('/api/eliminar-conteo/:id', async (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Eliminación no disponible. Base de datos local no configurada.'
  });
});

// Endpoint para consultar conteo guardado de un SKU específico
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

// Endpoint para exportar todos los conteos del día con comparación WMS
app.post('/api/exportar-conteos-dia', async (req, res) => {
  try {
    const { cuenta, fecha } = req.body;
    const fechaHoy = fecha || new Date().toISOString().split('T')[0];
    
    const poolLocal = await connectLocal();
    const poolRemoto = await connectRemoto();
    
    // Obtener todos los conteos del día para la cuenta
    const result = await poolLocal.request()
      .input('cuenta', sql.VarChar, cuenta)
      .input('fecha', sql.Date, fechaHoy)
      .query(`
        SELECT 
          r.id_producto AS SKU,
          r.cantidad_contada AS CantidadFisica,
          r.lote_proveedor_fisico AS Lote,
          r.fechacaducidad_fisica AS FechaCaducidad,
          s.ubicacion_escaneada AS Ubicacion,
          s.fecha_inicio AS FechaConteo
        FROM REGISTROS_CONTEO_FISICO r
        INNER JOIN SESIONES_CONTEO_FISICO s ON r.id_sesion = s.id_sesion
        WHERE s.nombre_cuenta = @cuenta
          AND CAST(s.fecha_inicio AS DATE) = @fecha
        ORDER BY s.fecha_inicio DESC
      `);
    
    if (result.recordset.length === 0) {
      return res.json({
        success: false,
        message: 'No hay registros para exportar en esta fecha'
      });
    }
    
    // Para cada registro, consultar WMS y calcular comparación
    const registrosCompletos = await Promise.all(
      result.recordset.map(async (reg) => {
        try {
          // Primero obtener descripción del producto (siempre existe)
          const productoResult = await poolRemoto.request()
            .input('sku', sql.VarChar, reg.SKU)
            .query(`SELECT TOP 1 IDProducto, Nombre FROM Producto WHERE IDProducto = @sku`);
          
          const descripcion = productoResult.recordset[0]?.Nombre || 'Sin descripción';
          
          // Luego obtener inventario y lote de la ubicación específica
          const wmsResult = await poolRemoto.request()
            .input('ubicacion', sql.VarChar, reg.Ubicacion)
            .input('sku', sql.VarChar, reg.SKU)
            .query(`
              SELECT 
                ISNULL(SUM(ib.Inventario), 0) AS CantidadWMS,
                MAX(ib.LoteInterno) AS LoteWMS
              FROM InventarioBodega ib
              LEFT JOIN UbicacionProductoInventario upi ON ib.IDProducto = upi.IDProducto
              WHERE ib.IDProducto = @sku
                AND (upi.IDUbicacion = @ubicacion OR upi.IDUbicacion IS NULL)
            `);
          
          const cantidadWMS = wmsResult.recordset[0]?.CantidadWMS || 0;
          const loteWMS = wmsResult.recordset[0]?.LoteWMS || '';
          const diferencia = reg.CantidadFisica - cantidadWMS;
          
          let porcentaje = 0;
          let estado = 'OK';
          
          if (cantidadWMS > 0) {
            porcentaje = ((reg.CantidadFisica / cantidadWMS) * 100).toFixed(2);
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
            ila: cantidadWMS,
            ira: reg.CantidadFisica,
            diferencia: diferencia,
            porcentaje: porcentaje,
            estado: estado,
            loteWMS: loteWMS,
            lote: reg.Lote || '',
            fechaCaducidad: reg.FechaCaducidad || ''
          };
        } catch (err) {
          console.error(`Error procesando SKU ${reg.SKU}:`, err);
          return {
            sku: reg.SKU,
            descripcion: 'Error al consultar',
            ubicacion: reg.Ubicacion,
            ila: 0,
            ira: reg.CantidadFisica,
            diferencia: reg.CantidadFisica,
            porcentaje: '∞',
            estado: 'ERROR',
            loteWMS: '',
            lote: reg.Lote || '',
            fechaCaducidad: reg.FechaCaducidad || ''
          };
        }
      })
    );
    
    res.json({
      success: true,
      registros: registrosCompletos
    });
    
  } catch (err) {
    console.error('Error al exportar conteos del día:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Endpoint para exportar conteos por periodo (rango de fechas)
app.get('/api/exportar-conteos-periodo', async (req, res) => {
  try {
    const { cuenta, fechaInicio, fechaFin } = req.query;
    
    if (!cuenta || !fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'Faltan parámetros: cuenta, fechaInicio y fechaFin son requeridos' });
    }
    
    const poolLocal = await connectLocal();
    const poolRemoto = await connectRemoto();
    
    // Obtener todos los conteos del periodo para la cuenta
    const result = await poolLocal.request()
      .input('cuenta', sql.VarChar, cuenta)
      .input('fechaInicio', sql.Date, fechaInicio)
      .input('fechaFin', sql.Date, fechaFin)
      .query(`
        SELECT 
          r.id_producto AS SKU,
          r.cantidad_contada AS CantidadFisica,
          r.lote_proveedor_fisico AS Lote,
          r.fechacaducidad_fisica AS FechaCaducidad,
          s.ubicacion_escaneada AS Ubicacion,
          s.fecha_inicio AS FechaConteo
        FROM REGISTROS_CONTEO_FISICO r
        INNER JOIN SESIONES_CONTEO_FISICO s ON r.id_sesion = s.id_sesion
        WHERE s.nombre_cuenta = @cuenta
          AND CAST(s.fecha_inicio AS DATE) >= @fechaInicio
          AND CAST(s.fecha_inicio AS DATE) <= @fechaFin
        ORDER BY s.fecha_inicio DESC
      `);
    
    if (result.recordset.length === 0) {
      return res.json({
        success: false,
        message: 'No hay registros para el periodo seleccionado',
        registros: []
      });
    }
    
    // Para cada registro, consultar WMS y calcular comparación
    const registrosCompletos = await Promise.all(
      result.recordset.map(async (reg) => {
        try {
          // Primero obtener descripción del producto
          const productoResult = await poolRemoto.request()
            .input('sku', sql.VarChar, reg.SKU)
            .query(`SELECT TOP 1 IDProducto, Nombre FROM Producto WHERE IDProducto = @sku`);
          
          const descripcion = productoResult.recordset[0]?.Nombre || 'Sin descripción';
          
          // Luego obtener inventario y lote de la ubicación específica
          const wmsResult = await poolRemoto.request()
            .input('ubicacion', sql.VarChar, reg.Ubicacion)
            .input('sku', sql.VarChar, reg.SKU)
            .query(`
              SELECT 
                ISNULL(SUM(ib.Inventario), 0) AS CantidadWMS,
                MAX(ib.LoteInterno) AS LoteWMS
              FROM InventarioBodega ib
              LEFT JOIN UbicacionProductoInventario upi ON ib.IDProducto = upi.IDProducto
              WHERE ib.IDProducto = @sku
                AND (upi.IDUbicacion = @ubicacion OR upi.IDUbicacion IS NULL)
            `);
          
          const cantidadWMS = wmsResult.recordset[0]?.CantidadWMS || 0;
          const loteWMS = wmsResult.recordset[0]?.LoteWMS || '';
          const diferencia = reg.CantidadFisica - cantidadWMS;
          
          let porcentaje = 0;
          let estado = 'OK';
          
          if (cantidadWMS > 0) {
            porcentaje = ((reg.CantidadFisica / cantidadWMS) * 100).toFixed(2);
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
            cantidad_sistema: cantidadWMS,
            cantidad_fisica: reg.CantidadFisica,
            diferencia: diferencia,
            porcentaje: porcentaje,
            estado: estado,
            lote_wms: loteWMS,
            lote: reg.Lote || '',
            fecha_caducidad: reg.FechaCaducidad || '',
            fecha_conteo: reg.FechaConteo ? new Date(reg.FechaConteo).toLocaleDateString('es-MX') : ''
          };
        } catch (err) {
          console.error(`Error procesando SKU ${reg.SKU}:`, err);
          return {
            sku: reg.SKU,
            descripcion: 'Error al consultar',
            ubicacion: reg.Ubicacion,
            cantidad_sistema: 0,
            cantidad_fisica: reg.CantidadFisica,
            diferencia: reg.CantidadFisica,
            porcentaje: '∞',
            estado: 'ERROR',
            lote_wms: '',
            lote: reg.Lote || '',
            fecha_caducidad: reg.FechaCaducidad || '',
            fecha_conteo: reg.FechaConteo ? new Date(reg.FechaConteo).toLocaleDateString('es-MX') : ''
          };
        }
      })
    );
    
    res.json({
      success: true,
      registros: registrosCompletos,
      total: registrosCompletos.length
    });
    
  } catch (err) {
    console.error('Error en exportar-conteos-periodo:', err);
    res.status(500).json({ error: 'Error al exportar datos del periodo' });
  }
});

// Endpoint para comparar inventario físico vs WMS
app.get('/api/comparar-inventario/:cuenta', async (req, res) => {
  try {
    const cuenta = req.params.cuenta;
    
    // Mapeo inverso: de nombre local a nombre en BD remota
    // Odella, Filorga y SVR comparten compañías 15 y 19
    // Edifier incluye múltiples compañías (5, 10)
    const mapaCuentasInverso = {
      'Montana': '1 Montana',
      'CESB': '2 CESB',
      'Liverpool': '7 Liverpool',
      'Fiserv': '8 Fiserv',
      'Glexico': '9 Glexico',
      'Edifier': ['5 EDF SOUND & TECHNOLOGY', '10 Edifier-Viewgraphics'],  // Edifier incluye EDF
      'Odella': ['15 Overnia', '19 Overnia MKT'],  // Odella incluye compañías 15 y 19
      'Filorga': ['15 Overnia', '19 Overnia MKT'],  // Filorga incluye compañías 15 y 19 (comparte con Odella)
      'Zaneo': '21 Zaneo Overnia',  // Zaneo es cuenta independiente
      'SVR': ['15 Overnia', '19 Overnia MKT']  // SVR incluye compañías 15 y 19 (comparte con Odella y Filorga)
    };
    
    const cuentaRemota = mapaCuentasInverso[cuenta] || cuenta;
    
    // Obtener ID de compañía (puede ser múltiple para SVR)
    const poolRemoto = await connectRemoto();
    let companiaResult;
    
    if (Array.isArray(cuentaRemota)) {
      // SVR: buscar en múltiples compañías
      const placeholders = cuentaRemota.map((_, i) => `@cuenta${i}`).join(', ');
      const request = poolRemoto.request();
      cuentaRemota.forEach((c, i) => request.input(`cuenta${i}`, sql.VarChar, c));
      companiaResult = await request.query(`SELECT IDCompania FROM Compania WHERE Nombre IN (${placeholders})`);
    } else {
      // Otras cuentas: una sola compañía
      companiaResult = await poolRemoto.request()
        .input('cuenta', sql.VarChar, cuentaRemota)
        .query('SELECT IDCompania FROM Compania WHERE Nombre = @cuenta');
    }
    
    if (companiaResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
    }
    
    // Obtener todos los IDs de compañía (puede ser múltiple para SVR)
    const idsCompania = companiaResult.recordset.map(r => r.IDCompania);
    
    // Obtener inventario del WMS
    const placeholders = idsCompania.map((_, i) => `@id${i}`).join(', ');
    const request = poolRemoto.request();
    idsCompania.forEach((id, i) => request.input(`id${i}`, sql.Int, id));
    
    const inventarioWMS = await request.query(`
        SELECT 
          ib.IDProducto,
          p.Nombre AS Descripcion,
          upi.IDUbicacion,
          ISNULL(upi.Cantidad, ib.Inventario) AS CantidadWMS
        FROM InventarioBodega ib
        LEFT JOIN Producto p ON ib.IDProducto = p.IDProducto
        LEFT JOIN UbicacionProductoInventario upi ON ib.IDProducto = upi.IDProducto
        WHERE ib.IDCompania IN (${placeholders})
      `);
    
    // Obtener conteo físico local
    const poolLocal = await connectLocal();
    const conteoFisico = await poolLocal.request()
      .input('cuenta', sql.VarChar, cuenta)
      .query(`
        SELECT 
          r.id_producto AS IDProducto,
          s.ubicacion_escaneada AS Ubicacion,
          SUM(r.cantidad_contada) AS CantidadFisica,
          MAX(s.fecha_inicio) AS FechaConteo
        FROM REGISTROS_CONTEO_FISICO r
        INNER JOIN SESIONES_CONTEO_FISICO s ON r.id_sesion = s.id_sesion
        WHERE s.nombre_cuenta = @cuenta
        GROUP BY r.id_producto, s.ubicacion_escaneada
      `);
    
    // Crear un mapa del conteo físico
    const mapaFisico = {};
    conteoFisico.recordset.forEach(item => {
      const key = `${item.IDProducto}-${item.Ubicacion}`;
      mapaFisico[key] = item.CantidadFisica;
    });
    
    // Comparar y generar resultado
    const comparacion = inventarioWMS.recordset.map(itemWMS => {
      const key = `${itemWMS.IDProducto}-${itemWMS.IDUbicacion || 'SIN_UBICACION'}`;
      const cantidadFisica = mapaFisico[key] || 0;
      const diferencia = cantidadFisica - (itemWMS.CantidadWMS || 0);
      
      return {
        sku: itemWMS.IDProducto,
        descripcion: itemWMS.Descripcion,
        ubicacion: itemWMS.IDUbicacion || 'Sin ubicación',
        cantidadWMS: itemWMS.CantidadWMS || 0,
        cantidadFisica: cantidadFisica,
        diferencia: diferencia,
        estado: diferencia === 0 ? 'OK' : (diferencia > 0 ? 'SOBRANTE' : 'FALTANTE')
      };
    });
    
    // Agregar items que están en físico pero no en WMS
    conteoFisico.recordset.forEach(itemFisico => {
      const existe = comparacion.find(c => c.sku === itemFisico.IDProducto && c.ubicacion === itemFisico.Ubicacion);
      if (!existe) {
        comparacion.push({
          sku: itemFisico.IDProducto,
          descripcion: 'Producto no encontrado en WMS',
          ubicacion: itemFisico.Ubicacion,
          cantidadWMS: 0,
          cantidadFisica: itemFisico.CantidadFisica,
          diferencia: itemFisico.CantidadFisica,
          estado: 'SOBRANTE'
        });
      }
    });
    
    res.json({
      success: true,
      cuenta: cuenta,
      fechaComparacion: new Date().toISOString(),
      totalRegistros: comparacion.length,
      data: comparacion
    });
    
  } catch (err) {
    console.error('Error al comparar inventario:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`\n=================================`);
  console.log(`Servidor iniciado en puerto ${PORT}`);
  console.log(`=================================\n`);
  
  // Intentar conexión inicial a ambas bases de datos
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

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err);
});

// Endpoint para sincronizar conteos desde la base remota `conteo_inventario_web`
app.post('/api/sync-conteos', async (req, res) => {
  let tx;
  try {
    const poolR = await connectRemoto();
    const remotoResult = await poolR.request().query(`
      SELECT * FROM conteo_inventario_web ORDER BY FechaConteo
    `);
    const rows = remotoResult.recordset || [];

    if (rows.length === 0) {
      return res.json({ success: true, imported: 0, message: 'No hay registros remotos para sincronizar' });
    }

    const poolL = await connectLocal();

    // Agrupar por cuenta+ubicación para crear una sesión por grupo
    const groups = {};
    rows.forEach(r => {
      const key = `${r.IDCuenta || ''}||${r.IDUbicacion || ''}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    tx = new sql.Transaction(poolL);
    await tx.begin();

    let totalInserted = 0;

    for (const key of Object.keys(groups)) {
      const group = groups[key];
      const first = group[0];

      // Crear sesión en la base local
      const insertSessionQuery = `
        INSERT INTO SESIONES_CONTEO_FISICO
        (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, fecha_cierre, id_usuario, estado_sesion)
        VALUES
        ('', '', @nombre_cuenta, @ubicacion, @fecha_inicio, @fecha_inicio, @usuario, 'IMPORTADO');
        SELECT SCOPE_IDENTITY() AS id;
      `;

      const sessReq = new sql.Request(tx);
      sessReq.input('nombre_cuenta', sql.VarChar, first.IDCuenta || '');
      sessReq.input('ubicacion', sql.VarChar, first.IDUbicacion || '');
      sessReq.input('fecha_inicio', sql.DateTime, first.FechaConteo || new Date());
      sessReq.input('usuario', sql.VarChar, first.Usuario || 'Remoto');

      const sessRes = await sessReq.query(insertSessionQuery);
      const id_sesion = sessRes.recordset && sessRes.recordset[0] && (sessRes.recordset[0].id || sessRes.recordset[0].ID) ? (sessRes.recordset[0].id || sessRes.recordset[0].ID) : null;

      if (!id_sesion) throw new Error('No se pudo crear la sesión local para el grupo: ' + key);

      // Insertar registros asociados a la sesión
      for (const r of group) {
        const regReq = new sql.Request(tx);
        regReq.input('id_sesion', sql.Int, id_sesion);
        regReq.input('id_producto', sql.VarChar, r.IDProducto || r.IDProducto || '');
        regReq.input('cantidad', sql.Int, r.CantidadFisica || r.CantidadFisica === 0 ? r.CantidadFisica : 0);
        regReq.input('lote', sql.VarChar, r.LoteProveedor || '');
        regReq.input('fechaCad', sql.DateTime, r.FechaCaducidad || null);

        await regReq.query(`
          INSERT INTO REGISTROS_CONTEO_FISICO
          (id_sesion, id_producto, cantidad_contada, lote_proveedor_fisico, fechacaducidad_fisica)
          VALUES
          (@id_sesion, @id_producto, @cantidad, @lote, @fechaCad)
        `);

        totalInserted++;
      }
    }

    await tx.commit();

    res.json({ success: true, imported: totalInserted });
  } catch (err) {
    try { if (tx) await tx.rollback(); } catch (e) { /* ignore */ }
    console.error('Error al sincronizar conteos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para autenticación: valida credenciales contra la BD remota (dbo.Usuario)
const crypto = require('crypto');

app.post('/api/authenticate', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: 'username y password son requeridos' });

    const poolR = await connectRemoto();
    const result = await poolR.request()
      .input('user', sql.VarChar, username)
      .query('SELECT TOP 1 * FROM dbo.Usuario WHERE IDUsuario = @user');

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    const userRow = result.recordset[0];
    const stored = (userRow.Password || userRow.PassWord || '').toString().trim();

    // Comparar: primero MD5(password) vs stored (case-insensitive), luego igualdad directa
    const md5 = crypto.createHash('md5').update(password).digest('hex');
    const ok = (md5.toLowerCase() === stored.toLowerCase()) || (password === stored);

    if (!ok) return res.status(401).json({ success: false, message: 'Credenciales inválidas' });

    // Inserción de una sesión de login en DB local (registro de acceso)
    try {
      const poolL = await connectLocal();
      const insertQ = `
        INSERT INTO SESIONES_CONTEO_FISICO (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, id_usuario, estado_sesion)
        VALUES ('', '', @nombre_cuenta, '', GETDATE(), @id_usuario, 'LOGIN');
        SELECT SCOPE_IDENTITY() AS id_sesion;
      `;
      const r = await poolL.request()
        .input('nombre_cuenta', sql.VarChar, username)
        .input('id_usuario', sql.VarChar, username)
        .query(insertQ);

      const id_sesion = r.recordset && r.recordset[0] && (r.recordset[0].id_sesion || r.recordset[0].id) ? (r.recordset[0].id_sesion || r.recordset[0].id) : null;

      return res.json({ success: true, message: 'Autenticación correcta', user: { id: userRow.IDUsuario, nombre: userRow.Nombre }, session_id: id_sesion });
    } catch (e) {
      console.error('Error al guardar sesión local:', e.message || e);
      // Aun así devolver autenticación exitosa (no bloquear login por fallo de audit)
      return res.json({ success: true, message: 'Autenticación correcta', user: { id: userRow.IDUsuario, nombre: userRow.Nombre } });
    }

  } catch (err) {
    console.error('Error en /api/authenticate:', err.message || err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para probar la conexión a la base de datos LOCAL sin modificar datos
app.get('/api/test-local', async (req, res) => {
  try {
    const pool = await connectLocal();
    const diagnostic = await pool.request().query('SELECT DB_NAME() AS BaseDatos, @@SERVERNAME AS Servidor');
    res.json({ success: true, local: diagnostic.recordset[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para sincronizar maestros (bodegas y compañias) desde la BD remota
app.post('/api/sync-maestros', async (req, res) => {
  // Opciones posibles en body: tableBodegas, tableCompanias, idColBodega, nameColBodega, idColCompania, nameColCompania
  const opts = req.body || {};
  let tx;
  try {
    const poolR = await connectRemoto();
    const poolL = await connectLocal();

    // Función auxiliar para detectar tabla candidata
    async function detectTable(candidates) {
      const q = `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'`;
      const tRes = await poolR.request().query(q);
      const tables = (tRes.recordset || []).map(r => (r.TABLE_NAME || '').toLowerCase());
      for (const c of candidates) {
        const idx = tables.indexOf(c.toLowerCase());
        if (idx >= 0) return tRes.recordset[idx].TABLE_NAME; // devolver el nombre real
      }
      return null;
    }

    // Detectar tablas para bodegas y compañias si no vienen en el body
    const tableBodegas = opts.tableBodegas || await detectTable(['bodega','bodegas','almacen','almacenes']);
    const tableCompanias = opts.tableCompanias || await detectTable(['compania','compañia','empresa','empresas','company']);

    if (!tableBodegas && !tableCompanias) {
      return res.status(400).json({ success: false, message: 'No se detectaron tablas candidatas para bodegas o compañias en la base remota. Provee `tableBodegas` o `tableCompanias` en el body.' });
    }

    // Crear tablas locales si no existen
    const createBodegas = `IF OBJECT_ID('dbo.MAESTRO_BODEGAS','U') IS NULL CREATE TABLE dbo.MAESTRO_BODEGAS (id NVARCHAR(100) PRIMARY KEY, nombre NVARCHAR(250), raw_row NVARCHAR(MAX));`;
    const createComp = `IF OBJECT_ID('dbo.MAESTRO_COMPANIAS','U') IS NULL CREATE TABLE dbo.MAESTRO_COMPANIAS (id NVARCHAR(100) PRIMARY KEY, nombre NVARCHAR(250), raw_row NVARCHAR(MAX));`;
    await poolL.request().query(createBodegas);
    await poolL.request().query(createComp);

    tx = new sql.Transaction(poolL);
    await tx.begin();

    let totalInserted = 0;
    let totalUpdated = 0;

    async function syncTable(sourceTable, idColsCandidates, nameColsCandidates, targetTable) {
      if (!sourceTable) return { inserted: 0, updated: 0 };

      // Obtener todos los registros remotos
      const remoteRows = (await poolR.request().query(`SELECT * FROM ${sourceTable}`)).recordset || [];

      for (const row of remoteRows) {
        // Determinar id y nombre por heurística
        let idVal = null;
        for (const c of idColsCandidates) { if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') { idVal = String(row[c]); break; } }
        if (!idVal) {
          // fallback: primera columna
          const firstKey = Object.keys(row)[0];
          idVal = firstKey ? String(row[firstKey]) : null;
        }

        let nameVal = null;
        for (const c of nameColsCandidates) { if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') { nameVal = String(row[c]); break; } }
        if (!nameVal) {
          const keys = Object.keys(row);
          nameVal = keys.length > 1 ? String(row[keys[1]]) : (idVal || '');
        }

        const raw = JSON.stringify(row);

        // Upsert usando MERGE
        const req = new sql.Request(tx);
        req.input('id', sql.NVarChar(100), idVal);
        req.input('nombre', sql.NVarChar(250), nameVal);
        req.input('raw', sql.NVarChar(sql.MAX), raw);

        const mergeQ = `
          MERGE dbo.${targetTable} AS target
          USING (SELECT @id AS id, @nombre AS nombre, @raw AS raw_row) AS src
          ON target.id = src.id
          WHEN MATCHED THEN UPDATE SET nombre = src.nombre, raw_row = src.raw_row
          WHEN NOT MATCHED THEN INSERT (id,nombre,raw_row) VALUES (src.id, src.nombre, src.raw_row);
        `;

        const r = await req.query(mergeQ);
        // sql package doesn't return affectedRows consistently for MERGE; we'll approximate
      }

      return { inserted: remoteRows.length, updated: 0 };
    }

    // Column name heuristics
    const idBCols = opts.idColBodega ? [opts.idColBodega] : ['IDBodega','IDBODEGA','IdBodega','ID','Codigo','CodBodega'];
    const nameBCols = opts.nameColBodega ? [opts.nameColBodega] : ['Nombre','Descripcion','NombreBodega','Bodega'];

    const idCCols = opts.idColCompania ? [opts.idColCompania] : ['IDCompania','IDCOMPANIA','IdCompania','IdEmpresa','ID','Codigo','CodCompania'];
    const nameCCols = opts.nameColCompania ? [opts.nameColCompania] : ['Nombre','RazonSocial','Empresa','NombreEmpresa'];

    // Ejecutar sincronización
    if (tableBodegas) {
      const r = await syncTable(tableBodegas, idBCols, nameBCols, 'MAESTRO_BODEGAS');
      totalInserted += r.inserted; totalUpdated += r.updated;
    }
    if (tableCompanias) {
      const r2 = await syncTable(tableCompanias, idCCols, nameCCols, 'MAESTRO_COMPANIAS');
      totalInserted += r2.inserted; totalUpdated += r2.updated;
    }

    await tx.commit();

    res.json({ success: true, message: 'Sincronización completada', inserted: totalInserted, updated: totalUpdated, tables: { tableBodegas, tableCompanias } });

  } catch (err) {
    try { if (tx) await tx.rollback(); } catch (e) { /* ignore */ }
    console.error('Error en /api/sync-maestros:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});