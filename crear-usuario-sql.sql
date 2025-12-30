-- ============================================
-- Crear usuario SQL para conexión desde Node.js
-- ============================================

USE InventarioLocal;
GO

-- Habilitar autenticación mixta (SQL + Windows)
-- Esto se hace desde SSMS: Propiedades del servidor > Seguridad > Autenticación de SQL Server y Windows

-- Crear login SQL
CREATE LOGIN inventario_user WITH PASSWORD = 'Inv3nt@rio2024!';
GO

-- Crear usuario en la base de datos
USE InventarioLocal;
CREATE USER inventario_user FOR LOGIN inventario_user;
GO

-- Dar permisos completos sobre la base de datos
ALTER ROLE db_owner ADD MEMBER inventario_user;
GO

-- Verificar
SELECT 'Usuario creado correctamente' AS Mensaje;
SELECT name, type_desc FROM sys.database_principals WHERE name = 'inventario_user';
GO
