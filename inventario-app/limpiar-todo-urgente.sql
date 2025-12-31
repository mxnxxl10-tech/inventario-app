USE master;
GO

-- Matar todas las conexiones activas a InventarioLocal
DECLARE @kill varchar(8000) = '';
SELECT @kill = @kill + 'KILL ' + CONVERT(varchar(5), session_id) + ';'
FROM sys.dm_exec_sessions
WHERE database_id = DB_ID('InventarioLocal')
  AND session_id <> @@SPID;

EXEC(@kill);
GO

USE InventarioLocal;
GO

-- TRUNCATE es mucho mas rapido que DELETE - elimina todo instantaneamente
-- Primero eliminar registros de detalle (tiene FK a sesiones)
TRUNCATE TABLE REGISTROS_CONTEO_FISICO;

-- Luego eliminar sesiones
TRUNCATE TABLE SESIONES_CONTEO_FISICO;

-- Reconstruir indices
ALTER INDEX ALL ON REGISTROS_CONTEO_FISICO REBUILD;
ALTER INDEX ALL ON SESIONES_CONTEO_FISICO REBUILD;

-- Actualizar estadisticas
UPDATE STATISTICS REGISTROS_CONTEO_FISICO WITH FULLSCAN;
UPDATE STATISTICS SESIONES_CONTEO_FISICO WITH FULLSCAN;

PRINT 'LIMPIEZA COMPLETA - Todas las tablas vaciadas';
PRINT 'Sistema listo para usar';
GO
