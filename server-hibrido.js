const express = require('express');
const sql = require('mssql');
const Database = require('better-sqlite3');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================
// BASE DE DATOS LOCAL (SQLite) - ESCRITURA
// ============================================
const dbLocal = new Database('inventario-local.db');

// Crear tabla si no existe
dbLocal.exec(`
    CREATE TABLE IF NOT EXISTS conteo_inventario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_cuenta TEXT NOT NULL,
        ubicacion TEXT NOT NULL,
        sku TEXT NOT NULL,
        cantidad REAL NOT NULL,
        usuario TEXT,
        fecha_conteo DATETIME DEFAULT CURRENT_TIMESTAMP,
        observaciones TEXT,
        sincronizado INTEGER DEFAULT 0,
        fecha_sincronizacion DATETIME
    );
    
    CREATE INDEX IF NOT EXISTS idx_cuenta ON conteo_inventario(codigo_cuenta);
    CREATE INDEX IF NOT EXISTS idx_ubicacion ON conteo_inventario(ubicacion);
    CREATE INDEX IF NOT EXISTS idx_sku ON conteo_inventario(sku);
`);

console.log('✅ Base de datos LOCAL (SQLite) inicializada');

// ============================================
// BASE DE DATOS REMOTA (SQL Server) - LECTURA
// ============================================
const configRemoto = {
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

let poolRemoto;

async function inicializarConexionRemota() {
    try {
        console.log('🔌 Conectando a servidor REMOTO...');
        poolRemoto = await sql.connect(configRemoto);
        console.log('✅ Conexión REMOTA establecida:', configRemoto.database);
        return true;
    } catch (error) {
        console.error('❌ Error conexión REMOTA:', error.message);
        return false;
    }
}

// ============================================
// ENDPOINTS - LECTURA (Servidor Remoto)
// ============================================

app.post('/api/validar-sku', async (req, res) => {
    try {
        const { sku } = req.body;
        
        console.log('🔍 Validando SKU:', sku);
        
        if (!sku) {
            return res.status(400).json({ error: 'SKU es requerido' });
        }

        const result = await poolRemoto.request()
            .input('sku', sql.NVarChar, sku)
            .query(`
                SELECT TOP 1 
                    IDProducto as sku,
                    Nombre as descripcion,
                    'producto' as tipo
                FROM Producto 
                WHERE IDProducto = @sku
            `);

        console.log('📊 Resultados:', result.recordset.length);
        
        if (result.recordset.length === 0) {
            console.log('❌ SKU NO encontrado:', sku);
            return res.status(404).json({ 
                error: 'SKU no encontrado',
                sku: sku 
            });
        }

        console.log('✅ SKU validado:', result.recordset[0]);
        res.json(result.recordset[0]);

    } catch (error) {
        console.error('❌ Error al validar SKU:', error);
        res.status(500).json({ 
            error: 'Error al validar SKU',
            detalle: error.message 
        });
    }
});

app.post('/api/consultar-inventario', async (req, res) => {
    try {
        const { ubicacion, sku } = req.body;

        console.log('🔍 Consultando inventario - Ubicación:', ubicacion, 'SKU:', sku);

        if (!ubicacion || !sku) {
            return res.status(400).json({ 
                error: 'Ubicación y SKU son requeridos' 
            });
        }

        const result = await poolRemoto.request()
            .input('ubicacion', sql.Numeric, ubicacion)
            .input('sku', sql.NVarChar, sku)
            .query(`
                SELECT TOP 1
                    ISNULL(upi.Cantidad, 0) as cantidad_sistema,
                    p.Nombre as descripcion_producto,
                    u.NombreUbicacion as descripcion_ubicacion
                FROM Producto p
                LEFT JOIN UbicacionProductoInventario upi 
                    ON p.IDProducto = upi.IDProducto 
                    AND upi.IDUbicacion = @ubicacion
                LEFT JOIN Ubicacion u ON u.IDUbicacion = @ubicacion
                WHERE p.IDProducto = @sku
            `);

        const datos = result.recordset[0];
        console.log('📊 Resultado inventario:', datos);
        
        if (datos && datos.descripcion_producto) {
            // Parsear ubicación "1-15-2-25-9" en sus componentes
            let pasillo = '', lado = '', pos_x = '', pos_y = '';
            if (datos.descripcion_ubicacion) {
                const partes = datos.descripcion_ubicacion.split('-');
                if (partes.length >= 5) {
                    pasillo = partes[1] || '';  // 15
                    lado = partes[2] || '';     // 2
                    pos_x = partes[3] || '';    // 25
                    pos_y = partes[4] || '';    // 9
                }
            }
            
            const respuesta = {
                success: true,
                data: {
                    cantidad: datos.cantidad_sistema || 0,
                    descripcion: datos.descripcion_producto,
                    ubicacion: datos.descripcion_ubicacion || '',
                    pasillo: pasillo,
                    lado: lado,
                    pos_x: pos_x,
                    pos_y: pos_y
                }
            };
            console.log('📤 Enviando respuesta:', JSON.stringify(respuesta, null, 2));
            res.json(respuesta);
        } else {
            res.json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

    } catch (error) {
        console.error('❌ Error al consultar inventario:', error);
        res.status(500).json({ 
            error: 'Error al consultar inventario',
            detalle: error.message 
        });
    }
});

// ============================================
// ENDPOINTS - ESCRITURA (SQLite Local)
// ============================================

app.post('/api/guardar-conteo', async (req, res) => {
    try {
        const { codigo_cuenta, ubicacion, sku, cantidad, usuario, observaciones } = req.body;

        if (!codigo_cuenta || !ubicacion || !sku || cantidad === undefined) {
            return res.status(400).json({ 
                error: 'Faltan campos requeridos' 
            });
        }

        const stmt = dbLocal.prepare(`
            INSERT INTO conteo_inventario 
                (codigo_cuenta, ubicacion, sku, cantidad, usuario, observaciones)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
            codigo_cuenta,
            ubicacion,
            sku,
            cantidad,
            usuario || 'Sistema',
            observaciones || ''
        );

        console.log('✅ Conteo guardado (LOCAL):', {
            id: result.lastInsertRowid,
            ubicacion,
            sku,
            cantidad
        });

        res.json({ 
            success: true, 
            id: result.lastInsertRowid,
            mensaje: 'Conteo guardado en base de datos LOCAL'
        });

    } catch (error) {
        console.error('❌ Error al guardar:', error);
        res.status(500).json({ 
            error: 'Error al guardar conteo',
            detalle: error.message 
        });
    }
});

app.get('/api/conteos-locales', async (req, res) => {
    try {
        const stmt = dbLocal.prepare(`
            SELECT * FROM conteo_inventario
            ORDER BY fecha_conteo DESC
        `);

        const conteos = stmt.all();
        console.log('✅ Conteos consultados:', conteos.length);
        res.json(conteos);

    } catch (error) {
        console.error('❌ Error al consultar:', error);
        res.status(500).json({ 
            error: 'Error al consultar conteos',
            detalle: error.message 
        });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 3000;

inicializarConexionRemota()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`\n${'='.repeat(60)}`);
            console.log('🚀 SERVIDOR CORRIENDO EN http://localhost:' + PORT);
            console.log('='.repeat(60));
            console.log('\n📊 ARQUITECTURA HÍBRIDA:');
            console.log('   🏠 LOCAL (SQLite)      → ESCRITURA (guardar conteos)');
            console.log('   🌐 REMOTO (SQL Server) → LECTURA (consultar datos)');
            console.log('\n💾 Archivo local: inventario-local.db');
            console.log('🌐 Servidor remoto: ' + configRemoto.server);
            console.log('='.repeat(60) + '\n');
        });
    })
    .catch(error => {
        console.error('❌ Error fatal:', error);
    });
