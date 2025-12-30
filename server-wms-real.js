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

// Configuración de SQL Server
const config = {
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

// Variable para mantener el pool de conexiones
let pool = null;

// Función para conectar a la base de datos
async function connectDB() {
  try {
    if (pool) {
      return pool;
    }
    console.log('Conectando a SQL Server...');
    pool = await sql.connect(config);
    console.log('✓ Conectado exitosamente a SQL Server');
    console.log(`  Host: ${config.server}`);
    console.log(`  Base de datos: ${config.database}`);
    return pool;
  } catch (err) {
    console.error('✗ Error al conectar a SQL Server:', err.message);
    throw err;
  }
}

// Endpoint de prueba
app.get('/api/test', async (req, res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query('SELECT @@VERSION as version');
    res.json({ 
      success: true, 
      message: 'Conexión exitosa a SQL Server',
      version: result.recordset[0].version
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para ver las tablas disponibles
app.get('/api/tablas', async (req, res) => {
  try {
    const pool = await connectDB();
    const result = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    res.json({ 
      success: true, 
      tablas: result.recordset 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para ver columnas de una tabla específica
app.get('/api/columnas/:tabla', async (req, res) => {
  try {
    const { tabla } = req.params;
    const pool = await connectDB();
    const result = await pool.request()
      .input('tabla', sql.VarChar, tabla)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = @tabla
        ORDER BY ORDINAL_POSITION
      `);
    res.json({ 
      success: true, 
      tabla: tabla,
      columnas: result.recordset 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para buscar un SKU específico
app.get('/api/buscar-sku/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const pool = await connectDB();
    
    // Buscar en la tabla producto
    const result = await pool.request()
      .input('sku', sql.VarChar, sku)
      .query(`
        SELECT TOP 10 * 
        FROM producto 
        WHERE IDProducto LIKE '%' + @sku + '%'
      `);
    
    res.json({ 
      success: true, 
      encontrados: result.recordset.length,
      datos: result.recordset 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para validar ubicación
app.post('/api/validar-ubicacion', async (req, res) => {
  try {
    const { ubicacion } = req.body;
    const pool = await connectDB();
    
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

// Endpoint para validar SKU
app.post('/api/validar-sku', async (req, res) => {
  try {
    const { sku } = req.body;
    const pool = await connectDB();
    
    const result = await pool.request()
      .input('sku', sql.VarChar, sku)
      .query('SELECT * FROM producto WHERE IDProducto = @sku');
    
    if (result.recordset.length > 0) {
      res.json({ 
        success: true, 
        data: result.recordset[0] 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'SKU no encontrado' 
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
    const { ubicacion, sku } = req.body;
    const pool = await connectDB();
    
    // Primero buscar el producto
    const productoQuery = `SELECT * FROM producto WHERE IDProducto = @sku`;
    const productoResult = await pool.request()
      .input('sku', sql.VarChar, sku)
      .query(productoQuery);
    
    if (productoResult.recordset.length === 0) {
      return res.json({ 
        success: false, 
        message: 'No se encontró el producto con ese SKU' 
      });
    }
    
    // Buscar ubicación con los campos correctos
    const ubicacionQuery = `SELECT * FROM ubicacion WHERE IDUbicacion = @ubicacion`;
    const ubicacionResult = await pool.request()
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(ubicacionQuery);
    
    const producto = productoResult.recordset[0];
    const ubicacionData = ubicacionResult.recordset.length > 0 ? ubicacionResult.recordset[0] : {};
    
    // Combinar datos con los campos correctos
    const data = {
      sku: producto.IDProducto,
      descripcion: producto.Nombre || producto.Descripcion || 'Sin descripción',
      ubicacion: ubicacion,
      pasillo: ubicacionData.IDPasillo || '',
      lado: ubicacionData.IDLado || '',
      pos_x: ubicacionData.PosX || '',
      pos_y: ubicacionData.PosY || '',
      cantidad: producto.Cantidad || 0
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
    
    const pool = await connectDB();
    
    // Insertar SOLO en la tabla nueva (conteo_inventario_web)
    // NO toca ninguna tabla existente de tu sistema
    const query = `
      INSERT INTO conteo_inventario_web 
      (IDCuenta, IDUbicacion, IDProducto, LoteProveedor, CantidadFisica, FechaCaducidad, FechaConteo, Usuario)
      VALUES 
      (@cuenta, @ubicacion, @sku, @loteProveedor, @cantidadFisica, @fechaCaducidad, GETDATE(), @usuario)
    `;
    
    await pool.request()
      .input('cuenta', sql.VarChar, cuenta)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('sku', sql.VarChar, sku)
      .input('loteProveedor', sql.VarChar, loteProveedor)
      .input('cantidadFisica', sql.Int, cantidadFisica)
      .input('fechaCaducidad', sql.Date, fechaCaducidad)
      .input('usuario', sql.VarChar, usuario || 'Sistema')
      .query(query);
    
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
  try {
    const { cuenta, ubicacion, fecha } = req.query;
    const pool = await connectDB();
    
    // Consulta SOLO la tabla nueva (conteo_inventario_web)
    let query = `
      SELECT 
        c.IDConteo,
        c.IDCuenta,
        c.IDUbicacion,
        c.IDProducto,
        p.Nombre as NombreProducto,
        c.LoteProveedor,
        c.CantidadFisica,
        c.FechaCaducidad,
        c.FechaConteo,
        c.Usuario
      FROM conteo_inventario_web c
      LEFT JOIN producto p ON c.IDProducto = p.IDProducto
      WHERE 1=1
    `;
    
    const request = pool.request();
    
    if (cuenta) {
      query += ' AND c.IDCuenta = @cuenta';
      request.input('cuenta', sql.VarChar, cuenta);
    }
    
    if (ubicacion) {
      query += ' AND c.IDUbicacion = @ubicacion';
      request.input('ubicacion', sql.VarChar, ubicacion);
    }
    
    if (fecha) {
      query += ' AND CAST(c.FechaConteo AS DATE) = @fecha';
      request.input('fecha', sql.Date, fecha);
    }
    
    query += ' ORDER BY c.FechaConteo DESC';
    
    const result = await request.query(query);
    
    res.json({ 
      success: true, 
      conteos: result.recordset 
    });
    
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para actualizar un conteo existente
app.put('/api/actualizar-conteo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { loteProveedor, cantidadFisica, fechaCaducidad } = req.body;
    
    const pool = await connectDB();
    
    // Actualiza SOLO en la tabla nueva (conteo_inventario_web)
    const query = `
      UPDATE conteo_inventario_web 
      SET 
        LoteProveedor = @loteProveedor,
        CantidadFisica = @cantidadFisica,
        FechaCaducidad = @fechaCaducidad,
        FechaModificacion = GETDATE()
      WHERE IDConteo = @id
    `;
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('loteProveedor', sql.VarChar, loteProveedor)
      .input('cantidadFisica', sql.Int, cantidadFisica)
      .input('fechaCaducidad', sql.Date, fechaCaducidad)
      .query(query);
    
    if (result.rowsAffected[0] > 0) {
      res.json({ 
        success: true, 
        message: 'Conteo actualizado exitosamente' 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No se encontró el conteo' 
      });
    }
    
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Endpoint para eliminar un conteo
app.delete('/api/eliminar-conteo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await connectDB();
    
    // Elimina SOLO de la tabla nueva (conteo_inventario_web)
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM conteo_inventario_web WHERE IDConteo = @id');
    
    if (result.rowsAffected[0] > 0) {
      res.json({ 
        success: true, 
        message: 'Conteo eliminado exitosamente' 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No se encontró el conteo' 
      });
    }
    
  } catch (err) {
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
  
  // Intentar conexión inicial a la base de datos
  try {
    await connectDB();
  } catch (err) {
    console.error('No se pudo conectar a la base de datos al iniciar');
  }
});

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\nCerrando servidor...');
  if (pool) {
    await pool.close();
  }
  process.exit(0);
});