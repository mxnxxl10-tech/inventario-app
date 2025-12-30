const sql = require('mssql');

// Probar diferentes configuraciones comunes
const configuraciones = [
    {
        nombre: 'localhost\\SQLEXPRESS',
        config: {
            server: 'localhost\\SQLEXPRESS',
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true
            }
        }
    },
    {
        nombre: '(local)\\SQLEXPRESS',
        config: {
            server: '(local)\\SQLEXPRESS',
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true
            }
        }
    },
    {
        nombre: 'localhost',
        config: {
            server: 'localhost',
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true
            }
        }
    }
];

async function probarConexion(config, nombre) {
    try {
        console.log(`\n🔍 Probando: ${nombre}...`);
        const pool = await sql.connect(config.config);
        const result = await pool.request().query('SELECT @@VERSION AS version');
        
        console.log(`✅ ¡CONEXIÓN EXITOSA!`);
        console.log(`📌 Servidor: ${nombre}`);
        console.log(`📊 Versión: ${result.recordset[0].version.split('\n')[0]}`);
        
        await pool.close();
        return nombre;
        
    } catch (error) {
        console.log(`❌ Falló: ${error.message.split('\n')[0]}`);
        return null;
    }
}

async function verificarTodas() {
    console.log('🔎 VERIFICANDO INSTALACIÓN DE SQL SERVER...\n');
    console.log('═'.repeat(50));
    
    for (const config of configuraciones) {
        const resultado = await probarConexion(config, config.nombre);
        if (resultado) {
            console.log('\n' + '═'.repeat(50));
            console.log('\n✅ SERVIDOR ENCONTRADO');
            console.log(`\n📝 Usa este valor en .env.local:`);
            console.log(`   DB_HOST_LOCAL=${resultado}`);
            console.log('\n' + '═'.repeat(50));
            return;
        }
    }
    
    console.log('\n' + '═'.repeat(50));
    console.log('\n❌ NO SE ENCONTRÓ SQL SERVER');
    console.log('\n💡 Asegúrate de que:');
    console.log('   1. SQL Server Express esté instalado');
    console.log('   2. El servicio esté iniciado');
    console.log('   3. Ejecuta: Get-Service MSSQL$SQLEXPRESS');
    console.log('\n' + '═'.repeat(50));
}

verificarTodas().catch(error => {
    console.error('\n❌ Error:', error.message);
});
