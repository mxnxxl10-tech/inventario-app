-- ============================================
-- Script para mejorar el rendimiento de la base de datos
-- Crea índices en las tablas de inventario
-- ============================================

USE InventarioLocal;
GO

-- Índice para búsquedas por sesión y producto en REGISTROS_CONTEO_FISICO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Registros_Sesion_Producto_Lote')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Registros_Sesion_Producto_Lote
    ON REGISTROS_CONTEO_FISICO (id_sesion, id_producto, lote_proveedor_fisico)
    INCLUDE (cantidad_contada, fechacaducidad_fisica, lote_wms, cantidad_wms);
    PRINT 'Índice IX_Registros_Sesion_Producto_Lote creado exitosamente';
END
ELSE
BEGIN
    PRINT 'Índice IX_Registros_Sesion_Producto_Lote ya existe';
END
GO

-- Índice para búsquedas por cuenta y ubicación en SESIONES_CONTEO_FISICO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Sesiones_Cuenta_Ubicacion_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Sesiones_Cuenta_Ubicacion_Fecha
    ON SESIONES_CONTEO_FISICO (nombre_cuenta, ubicacion_escaneada, fecha_inicio DESC)
    INCLUDE (id_sesion);
    PRINT 'Índice IX_Sesiones_Cuenta_Ubicacion_Fecha creado exitosamente';
END
ELSE
BEGIN
    PRINT 'Índice IX_Sesiones_Cuenta_Ubicacion_Fecha ya existe';
END
GO

-- Índice para búsquedas por fecha en SESIONES_CONTEO_FISICO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Sesiones_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Sesiones_Fecha
    ON SESIONES_CONTEO_FISICO (fecha_inicio DESC, nombre_cuenta)
    INCLUDE (id_sesion, ubicacion_escaneada);
    PRINT 'Índice IX_Sesiones_Fecha creado exitosamente';
END
ELSE
BEGIN
    PRINT 'Índice IX_Sesiones_Fecha ya existe';
END
GO

PRINT '';
PRINT '============================================';
PRINT 'Índices creados exitosamente';
PRINT 'El rendimiento de consultas y actualizaciones debería mejorar significativamente';
PRINT '============================================';
