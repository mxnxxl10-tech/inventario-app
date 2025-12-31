-- Script para eliminar registros 


USE InventarioLocal;
GO


SELECT 
    'SESIONES' AS Tabla,
    COUNT(*) AS TotalRegistros
FROM SESIONES_CONTEO_FISICO
WHERE CAST(fecha_inicio AS DATE) >= '2025-12-16'

UNION ALL

SELECT 
    'REGISTROS' AS Tabla,
    COUNT(*) AS TotalRegistros     
FROM REGISTROS_CONTEO_FISICO r
INNER JOIN SESIONES_CONTEO_FISICO s ON r.id_sesion = s.id_sesion
WHERE CAST(s.fecha_inicio AS DATE) >= '2025-12-16';

GO


GO

