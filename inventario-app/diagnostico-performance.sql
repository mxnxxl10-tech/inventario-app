-- ============================================
-- Script de diagnóstico de rendimiento
-- ============================================

USE InventarioLocal;
GO

PRINT '=== DIAGNÓSTICO DE RENDIMIENTO ===';
PRINT '';

-- 1. Contar registros en las tablas
PRINT '1. CANTIDAD DE REGISTROS:';
SELECT 'SESIONES_CONTEO_FISICO' AS Tabla, COUNT(*) AS Registros FROM SESIONES_CONTEO_FISICO;
SELECT 'REGISTROS_CONTEO_FISICO' AS Tabla, COUNT(*) AS Registros FROM REGISTROS_CONTEO_FISICO;
PRINT '';

-- 2. Ver índices existentes
PRINT '2. ÍNDICES EXISTENTES:';
SELECT 
    OBJECT_NAME(i.object_id) AS Tabla,
    i.name AS NombreIndice,
    i.type_desc AS TipoIndice,
    STUFF((SELECT ', ' + c.name
           FROM sys.index_columns ic
           JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
           WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
           ORDER BY ic.key_ordinal
           FOR XML PATH('')), 1, 2, '') AS Columnas
FROM sys.indexes i
WHERE OBJECT_NAME(i.object_id) IN ('SESIONES_CONTEO_FISICO', 'REGISTROS_CONTEO_FISICO')
  AND i.type > 0  -- Excluir heaps
ORDER BY Tabla, NombreIndice;
PRINT '';

-- 3. Ver estadísticas de fragmentación
PRINT '3. FRAGMENTACIÓN DE ÍNDICES:';
SELECT 
    OBJECT_NAME(ips.object_id) AS Tabla,
    i.name AS Indice,
    ips.avg_fragmentation_in_percent AS Fragmentacion_Porcentaje,
    ips.page_count AS Paginas
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
WHERE OBJECT_NAME(ips.object_id) IN ('SESIONES_CONTEO_FISICO', 'REGISTROS_CONTEO_FISICO')
  AND ips.avg_fragmentation_in_percent > 0
ORDER BY ips.avg_fragmentation_in_percent DESC;
PRINT '';

-- 4. Ver tamaño de las tablas
PRINT '4. TAMAÑO DE LAS TABLAS:';
SELECT 
    t.name AS Tabla,
    p.rows AS NumeroFilas,
    SUM(a.total_pages) * 8 / 1024 AS TamanoTotal_MB,
    SUM(a.used_pages) * 8 / 1024 AS TamanoUsado_MB
FROM sys.tables t
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
WHERE t.name IN ('SESIONES_CONTEO_FISICO', 'REGISTROS_CONTEO_FISICO')
GROUP BY t.name, p.rows
ORDER BY t.name;
PRINT '';

-- 5. Verificar si hay bloqueos activos
PRINT '5. SESIONES Y BLOQUEOS ACTIVOS:';
SELECT 
    session_id,
    status,
    blocking_session_id,
    wait_type,
    wait_time,
    cpu_time,
    reads,
    writes
FROM sys.dm_exec_requests
WHERE session_id > 50  -- Excluir sesiones del sistema
  AND status <> 'sleeping';
PRINT '';

PRINT '=== FIN DEL DIAGNOSTICO ===';
PRINT '';
PRINT 'INTERPRETACION:';
PRINT '- Si hay muchos registros (>100,000), las consultas seran mas lentas sin indices';
PRINT '- Si la fragmentacion es >30%, considera reconstruir los indices';
PRINT '- Si hay sesiones bloqueadas (blocking_session_id > 0), hay contencion';
PRINT '- Verifica que los indices creados en crear-indices-performance.sql existan';
