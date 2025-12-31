-- =========================================================
-- SCRIPT PARA CREAR LAS TABLAS DE CONTEO FÍSICO
-- Base de datos: inventario_app
-- =========================================================

USE inventario_app;
GO

-- TABLA 1: SESIONES_CONTEO_FISICO
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SESIONES_CONTEO_FISICO' AND xtype='U')
BEGIN
    CREATE TABLE dbo.SESIONES_CONTEO_FISICO (
        id_sesion INT IDENTITY(1,1) PRIMARY KEY,
        id_bodega VARCHAR(10),
        id_compania VARCHAR(10),
        nombre_cuenta VARCHAR(50) NOT NULL,
        ubicacion_escaneada VARCHAR(50) NOT NULL,
        fecha_inicio DATETIME NOT NULL DEFAULT GETDATE(),
        fecha_cierre DATETIME NULL,
        id_usuario VARCHAR(50),
        estado_sesion VARCHAR(20) DEFAULT 'COMPLETADO'
    );
    
    PRINT '✓ Tabla SESIONES_CONTEO_FISICO creada exitosamente';
END
ELSE
BEGIN
    PRINT 'ℹ La tabla SESIONES_CONTEO_FISICO ya existe';
END
GO

-- TABLA 2: REGISTROS_CONTEO_FISICO
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='REGISTROS_CONTEO_FISICO' AND xtype='U')
BEGIN
    CREATE TABLE dbo.REGISTROS_CONTEO_FISICO (
        id_registro INT IDENTITY(1,1) PRIMARY KEY,
        id_sesion INT NOT NULL,
        id_producto VARCHAR(50) NOT NULL,
        cantidad_contada INT NOT NULL,
        lote_proveedor_fisico VARCHAR(50),
        fechacaducidad_fisica DATETIME,
        CONSTRAINT FK_Registros_Sesion 
            FOREIGN KEY (id_sesion) 
            REFERENCES dbo.SESIONES_CONTEO_FISICO(id_sesion)
    );
    
    PRINT '✓ Tabla REGISTROS_CONTEO_FISICO creada exitosamente';
END
ELSE
BEGIN
    PRINT 'ℹ La tabla REGISTROS_CONTEO_FISICO ya existe';
END
GO

-- Crear índices para mejorar el rendimiento
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Sesion_Cuenta')
    CREATE INDEX IX_Sesion_Cuenta ON dbo.SESIONES_CONTEO_FISICO(nombre_cuenta);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Sesion_Ubicacion')
    CREATE INDEX IX_Sesion_Ubicacion ON dbo.SESIONES_CONTEO_FISICO(ubicacion_escaneada);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Sesion_Fecha')
    CREATE INDEX IX_Sesion_Fecha ON dbo.SESIONES_CONTEO_FISICO(fecha_inicio);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Registro_Producto')
    CREATE INDEX IX_Registro_Producto ON dbo.REGISTROS_CONTEO_FISICO(id_producto);

PRINT '';
PRINT '==============================================';
PRINT '✓ TODAS LAS TABLAS CREADAS CORRECTAMENTE';
PRINT '==============================================';
GO
