const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configuración para base de datos LOCAL (escritura)
const configLocal = {
    server: process.env.DB_HOST_LOCAL,
    database: process.env.DB_NAME_LOCAL,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        trustedConnection: true  // Usar Windows Authentication
    }
};

// Si hay usuario/password, usar SQL Authentication
if (process.env.DB_USER_LOCAL && process.env.DB_PASSWORD_LOCAL) {
    configLocal.user = process.env.DB_USER_LOCAL;
    configLocal.password = process.env.DB_PASSWORD_LOCAL;
    configLocal.options.trustedConnection = false;
}

// Configuración para servidor REMOTO (solo lectura)
const configRemoto = {
    server: process.env.DB_HOST_REMOTO,
    user: process.env.DB_USER_REMOTO,
    password: process.env.DB_PASSWORD_REMOTO,
    database: process.env.DB_NAME_REMOTO,
    port: parseInt(process.env.DB_PORT_REMOTO),
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Pools de conexión
let poolLocal;
let poolRemoto;

// Inicializar conexiones
async function inicializarConexiones() {
    try {
        console.log('\n🔌 Conectando a base de datos LOCAL...');
        poolLocal = await sql.connect(configLocal);
        console.log('✅ Conexión LOCAL establecida:', configLocal.database);

        console.log('\n🔌 Conectando a servidor REMOTO...');
        poolRemoto = await new sql.ConnectionPool(configRemoto).connect();
        console.log('✅ Conexión REMOTA establecida:', configRemoto.database);

        console.log('\n✅ AMBAS CONEXIONES ACTIVAS');
        console.log('   📝 Escritura → LOCAL:', configLocal.database);
        console.log('   📖 Lectura → REMOTO:', configRemoto.database);
    } catch (error) {
        console.error('❌ Error al conectar:', error.message);
        throw error;
    }
}

// Endpoint para validar SKU (LECTURA desde servidor REMOTO)
app.post('/api/validar-sku', async (req, res) => {
    try {
        const { sku } = req.body;
        
        if (!sku) {
            return res.status(400).json({ error: 'SKU es requerido' });
        }

        const result = await poolRemoto.request()
            .input('sku', sql.NVarChar, sku)
            .query(`
                SELECT TOP 1 
                    codigo_producto as sku,
                    nombre as descripcion,
                    'producto' as tipo
                FROM producto 
                WHERE codigo_producto = @sku
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                error: 'SKU no encontrado',
                sku: sku 
            });
        }

        console.log('✅ SKU validado (REMOTO):', sku);
        res.json(result.recordset[0]);

    } catch (error) {
        console.error('❌ Error al validar SKU:', error);
        res.status(500).json({ 
            error: 'Error al validar SKU',
            detalle: error.message 
        });
    }
});

// Endpoint para consultar inventario (LECTURA desde servidor REMOTO)
app.post('/api/consultar-inventario', async (req, res) => {
    try {
        const { ubicacion, sku } = req.body;

        if (!ubicacion || !sku) {
            return res.status(400).json({ 
                error: 'Ubicación y SKU son requeridos' 
            });
        }

        const result = await poolRemoto.request()
            .input('ubicacion', sql.NVarChar, ubicacion)
            .input('sku', sql.NVarChar, sku)
            .query(`
                SELECT 
                    i.cantidad_actual as cantidad_sistema,
                    p.nombre as descripcion_producto,
                    u.nombre as descripcion_ubicacion
                FROM inventario i
                INNER JOIN producto p ON i.codigo_producto = p.codigo_producto
                INNER JOIN ubicacion u ON i.codigo_ubicacion = u.codigo_ubicacion
                WHERE i.codigo_ubicacion = @ubicacion 
                AND i.codigo_producto = @sku
            `);

        console.log('✅ Inventario consultado (REMOTO):', ubicacion, sku);
        res.json(result.recordset[0] || { cantidad_sistema: 0 });

    } catch (error) {
        console.error('❌ Error al consultar inventario:', error);
        res.status(500).json({ 
            error: 'Error al consultar inventario',
            detalle: error.message 
        });
    }
});

// Endpoint para guardar conteo (ESCRITURA en base de datos LOCAL)
app.post('/api/guardar-conteo', async (req, res) => {
    try {
        const { codigo_cuenta, ubicacion, sku, cantidad, usuario, observaciones } = req.body;

        if (!codigo_cuenta || !ubicacion || !sku || cantidad === undefined) {
            return res.status(400).json({ 
                error: 'Faltan campos requeridos' 
            });
        }

        const result = await poolLocal.request()
            .input('codigo_cuenta', sql.NVarChar, codigo_cuenta)
            .input('ubicacion', sql.NVarChar, ubicacion)
            .input('sku', sql.NVarChar, sku)
            .input('cantidad', sql.Decimal(18, 2), cantidad)
            .input('usuario', sql.NVarChar, usuario || 'Sistema')
            .input('observaciones', sql.NVarChar, observaciones || '')
            .query(`
                INSERT INTO conteo_inventario 
                    (codigo_cuenta, ubicacion, sku, cantidad, usuario, observaciones, fecha_conteo)
                VALUES 
                    (@codigo_cuenta, @ubicacion, @sku, @cantidad, @usuario, @observaciones, GETDATE());
                
                SELECT SCOPE_IDENTITY() as id;
            `);

        const nuevoId = result.recordset[0].id;
        
        console.log('✅ Conteo guardado (LOCAL):', {
            id: nuevoId,
            ubicacion,
            sku,
            cantidad
        });

        res.json({ 
            success: true, 
            id: nuevoId,
            mensaje: 'Conteo guardado exitosamente en base de datos LOCAL'
        });

    } catch (error) {
        console.error('❌ Error al guardar conteo:', error);
        res.status(500).json({ 
            error: 'Error al guardar conteo',
            detalle: error.message 
        });
    }
});

// Endpoint para obtener todos los conteos guardados localmente
app.get('/api/conteos-locales', async (req, res) => {
    try {
        const result = await poolLocal.request().query(`
            SELECT 
                id,
                codigo_cuenta,
                ubicacion,
                sku,
                cantidad,
                usuario,
                fecha_conteo,
                observaciones,
                sincronizado,
                fecha_sincronizacion
            FROM conteo_inventario
            ORDER BY fecha_conteo DESC
        `);

        console.log('✅ Conteos locales consultados:', result.recordset.length);
        res.json(result.recordset);

    } catch (error) {
        console.error('❌ Error al consultar conteos:', error);
        res.status(500).json({ 
            error: 'Error al consultar conteos',
            detalle: error.message 
        });
    }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;

inicializarConexiones()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
            console.log('\n📊 ARQUITECTURA DE DOBLE BASE DE DATOS:');
            console.log('   🏠 LOCAL  → Escritura (guardar conteos)');
            console.log('   🌐 REMOTO → Lectura (consultar productos/inventario)');
        });
    })
    .catch(error => {
        console.error('❌ Error fatal al iniciar:', error);
        process.exit(1);
    });
