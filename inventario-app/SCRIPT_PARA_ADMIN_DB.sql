-- =====================================================
-- SCRIPT PARA EL ADMINISTRADOR DE LA BASE DE DATOS
-- Base de datos: Recsolog_wms
-- Servidor: SERVIDOR-DB192 (204.232.237.135:7433)
-- =====================================================
-- Este script crea las tablas necesarias para el módulo 
-- de inventario físico de la aplicación de conteo.
-- =====================================================

USE Recsolog_wms;
GO

-- Tabla de sesiones de conteo físico
IF NOT EXISTS (SELECT * FROM sys.objects WHERE name='SESIONES_CONTEO_FISICO' AND type='U')
BEGIN
    CREATE TABLE SESIONES_CONTEO_FISICO (
        id_sesion INT IDENTITY(1,1) PRIMARY KEY,
        id_bodega VARCHAR(10),
        id_compania VARCHAR(10),
        nombre_cuenta VARCHAR(50),
        ubicacion_escaneada VARCHAR(50),
        fecha_inicio DATETIME DEFAULT GETDATE(),
        fecha_cierre DATETIME,
        id_usuario VARCHAR(50),
        estado_sesion VARCHAR(20)
    );
    PRINT 'Tabla SESIONES_CONTEO_FISICO creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla SESIONES_CONTEO_FISICO ya existe.';
END
GO

-- Tabla de registros de conteo físico
IF NOT EXISTS (SELECT * FROM sys.objects WHERE name='REGISTROS_CONTEO_FISICO' AND type='U')
BEGIN
    CREATE TABLE REGISTROS_CONTEO_FISICO (
        id_registro INT IDENTITY(1,1) PRIMARY KEY,
        id_sesion INT FOREIGN KEY REFERENCES SESIONES_CONTEO_FISICO(id_sesion),
        id_producto VARCHAR(50),
        cantidad_contada INT,
        lote_proveedor_fisico VARCHAR(50),
        fechacaducidad_fisica DATETIME
    );
    PRINT 'Tabla REGISTROS_CONTEO_FISICO creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla REGISTROS_CONTEO_FISICO ya existe.';
END
GO

-- Verificar que las tablas se crearon correctamente
SELECT 
    'SESIONES_CONTEO_FISICO' AS Tabla,
    COUNT(*) AS CantidadColumnas
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'SESIONES_CONTEO_FISICO'

UNION ALL

SELECT 
    'REGISTROS_CONTEO_FISICO' AS Tabla,
    COUNT(*) AS CantidadColumnas
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'REGISTROS_CONTEO_FISICO';
GO

PRINT '✓ Script completado. Las tablas están listas para usar.';
GO
