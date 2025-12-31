-- ============================================
-- Script para limpiar datos antiguos y mejorar rendimiento
-- ADVERTENCIA: Esto eliminara datos permanentemente
-- ============================================

USE InventarioLocal;
GO

PRINT 'Iniciando limpieza de datos antiguos...';
PRINT '';

-- 1. Eliminar registros de hace mas de 30 dias
DECLARE @FechaCorte DATE = DATEADD(DAY, -30, GETDATE());
DECLARE @RegistrosEliminados INT;

PRINT 'Fecha de corte: ' + CONVERT(VARCHAR(10), @FechaCorte, 120);
PRINT '';

-- Primero eliminar los registros de conteo
DELETE FROM REGISTROS_CONTEO_FISICO
WHERE id_sesion IN (
    SELECT id_sesion 
    FROM SESIONES_CONTEO_FISICO 
    WHERE fecha_inicio < @FechaCorte
);

SET @RegistrosEliminados = @@ROWCOUNT;
PRINT 'Registros de conteo eliminados: ' + CAST(@RegistrosEliminados AS VARCHAR(20));

-- Luego eliminar las sesiones
DELETE FROM SESIONES_CONTEO_FISICO
WHERE fecha_inicio < @FechaCorte;

SET @RegistrosEliminados = @@ROWCOUNT;
PRINT 'Sesiones eliminadas: ' + CAST(@RegistrosEliminados AS VARCHAR(20));
PRINT '';

-- Reconstruir indices para eliminar fragmentacion
PRINT 'Reconstruyendo indices...';
ALTER INDEX ALL ON REGISTROS_CONTEO_FISICO REBUILD;
ALTER INDEX ALL ON SESIONES_CONTEO_FISICO REBUILD;
PRINT 'Indices reconstruidos';
PRINT '';

-- Actualizar estadisticas
PRINT 'Actualizando estadisticas...';
UPDATE STATISTICS REGISTROS_CONTEO_FISICO WITH FULLSCAN;
UPDATE STATISTICS SESIONES_CONTEO_FISICO WITH FULLSCAN;
PRINT 'Estadisticas actualizadas';
PRINT '';

PRINT '============================================';
PRINT 'Limpieza completada exitosamente';
PRINT '============================================';
