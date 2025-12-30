const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ============================================
// BASE DE DATOS LOCAL (SQL Server) - ESCRITURA
// ============================================
const configLocal = {
    server: 'localhost',
    port: 1433,
    user: 'inventario_user',
    password: 'Inv3nt@rio2024!',
    database: 'InventarioLocal',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        useUTC: false
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    connectionTimeout: 15000,
    requestTimeout: 15000
};

let poolLocal;

async function inicializarConexionLocal() {
    try {
        console.log('🔌 Conectando a SQL Server LOCAL...');
        console.log('   Server:', configLocal.server);
        console.log('   Database:', configLocal.database);
        console.log('   User:', configLocal.user);
        poolLocal = await new sql.ConnectionPool(configLocal).connect();
        console.log('✅ Conexión LOCAL establecida:', configLocal.database);
        return true;
    } catch (error) {
        console.error('❌ Error conexión LOCAL:', error.message);
        console.error('   Código de error:', error.code);
        console.error('   Error completo:', error);
        return false;
    }
}

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
            let ubicacionValida = false;
            
            if (datos.descripcion_ubicacion) {
                const partes = datos.descripcion_ubicacion.split('-');
                console.log('🔍 Partes de ubicación:', partes);
                
                if (partes.length >= 5) {
                    pasillo = partes[1] || '';  // 15
                    lado = partes[2] || '';     // 2
                    pos_x = partes[3] || '';    // 25
                    pos_y = partes[4] || '';    // 9
                    ubicacionValida = true;
                } else {
                    console.log('⚠️  Formato de ubicación no válido:', datos.descripcion_ubicacion);
                }
            } else {
                console.log('⚠️  Sin ubicación en la base de datos');
            }
            
            const respuesta = {
                success: true,
                data: {
                    cantidad: datos.cantidad_sistema || 0,
                    descripcion: datos.descripcion_producto,
                    ubicacion: datos.descripcion_ubicacion || 'Sin ubicación',
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
// ENDPOINTS - ESCRITURA (SQL Server Local)
// ============================================

app.post('/api/guardar-conteo', async (req, res) => {
    try {
        // Aceptar ambos formatos de campos
        const { 
            codigo_cuenta, cuenta, 
            ubicacion, 
            sku, 
            cantidad, cantidadFisica,
            usuario, 
            observaciones,
            loteProveedor,
            fechaCaducidad
        } = req.body;

        const codigoCuenta = codigo_cuenta || cuenta;
        const cantidadFinal = cantidad || cantidadFisica;

        if (!codigoCuenta || !ubicacion || !sku || cantidadFinal === undefined) {
            console.log('❌ Campos faltantes:', { codigoCuenta, ubicacion, sku, cantidadFinal });
            return res.status(400).json({ 
                error: 'Faltan campos requeridos',
                recibido: req.body
            });
        }

        const observacionesCompletas = [
            observaciones,
            loteProveedor ? `Lote: ${loteProveedor}` : null,
            fechaCaducidad ? `Caducidad: ${fechaCaducidad}` : null
        ].filter(Boolean).join(' | ');

        console.log('💾 Guardando conteo:', { codigoCuenta, ubicacion, sku, cantidadFinal });

        const result = await poolLocal.request()
            .input('codigo_cuenta', sql.NVarChar, codigoCuenta)
            .input('ubicacion', sql.NVarChar, ubicacion)
            .input('sku', sql.NVarChar, sku)
            .input('cantidad', sql.Decimal(18, 2), cantidadFinal)
            .input('usuario', sql.NVarChar, usuario || 'Sistema')
            .input('observaciones', sql.NVarChar, observacionesCompletas || '')
            .query(`
                INSERT INTO conteo_inventario 
                    (codigo_cuenta, ubicacion, sku, cantidad, usuario, observaciones, fecha_conteo)
                VALUES 
                    (@codigo_cuenta, @ubicacion, @sku, @cantidad, @usuario, @observaciones, GETDATE());
                
                SELECT SCOPE_IDENTITY() as id;
            `);

        const nuevoId = result.recordset[0].id;
        
        console.log('✅ Conteo guardado (SQL Server LOCAL):', {
            id: nuevoId,
            ubicacion,
            sku,
            cantidad
        });

        res.json({ 
            success: true, 
            id: nuevoId,
            mensaje: 'Conteo guardado en SQL Server LOCAL'
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

        console.log('✅ Conteos consultados:', result.recordset.length);
        res.json(result.recordset);

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

async function iniciar() {
    console.log('🚀 Iniciando servidor...\n');
    
    const localOk = await inicializarConexionLocal();
    const remotoOk = await inicializarConexionRemota();
    
    if (!localOk) {
        console.log('\n⚠️  No se pudo conectar a la base de datos LOCAL');
        console.log('   Verifica que:');
        console.log('   1. SQL Server Express esté corriendo');
        console.log('   2. La base de datos InventarioLocal exista');
        console.log('   3. El usuario inventario_user tenga permisos');
        console.log('   4. TCP/IP esté habilitado en puerto 1433\n');
        return;
    }
    
    if (!remotoOk) {
        console.log('\n⚠️  No se pudo conectar al servidor REMOTO');
        return;
    }
    
    app.listen(PORT, () => {
        console.log(`\n${'='.repeat(60)}`);
        console.log('🚀 SERVIDOR CORRIENDO EN http://localhost:' + PORT);
        console.log('='.repeat(60));
        console.log('\n📊 ARQUITECTURA DUAL:');
        console.log('   🏠 LOCAL (SQL Server) → ESCRITURA (guardar conteos)');
        console.log('   🌐 REMOTO (SQL Server) → LECTURA (consultar datos)');
        console.log('\n💾 Base de datos local: ' + configLocal.server + '\\' + configLocal.database);
        console.log('🌐 Servidor remoto: ' + configRemoto.server);
        console.log('='.repeat(60) + '\n');
    });
}

iniciar().catch(error => {
    console.error('❌ Error fatal:', error);
});
