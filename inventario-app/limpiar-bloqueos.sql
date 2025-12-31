-- Script para limpiar bloqueos en la base de datos
USE InventarioLocal;
GO

-- Ver procesos bloqueados
SELECT 
    session_id,
    blocking_session_id,
    wait_type,
    wait_time,
    wait_resource
FROM sys.dm_exec_requests
WHERE blocking_session_id <> 0;

-- Matar sesiones bloqueantes (ejecutar manualmente el KILL del session_id que aparezca)
-- KILL [session_id];

-- Limpiar transacciones abiertas
DBCC OPENTRAN;
GO
