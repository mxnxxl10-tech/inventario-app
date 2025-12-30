-- ============================================
-- Script para crear base de datos LOCAL
-- en SQL Server Management Studio (SSMS)
-- ============================================

-- Crear la base de datos local
CREATE DATABASE InventarioLocal;
GO

USE InventarioLocal;
GO

-- Crear la tabla para guardar los conteos
CREATE TABLE conteo_inventario (
    id INT IDENTITY(1,1) PRIMARY KEY,
    codigo_cuenta NVARCHAR(50) NOT NULL,
    ubicacion NVARCHAR(50) NOT NULL,
    sku NVARCHAR(100) NOT NULL,
    cantidad DECIMAL(18,2) NOT NULL,
    usuario NVARCHAR(100),
    fecha_conteo DATETIME DEFAULT GETDATE(),
    observaciones NVARCHAR(MAX),
    sincronizado BIT DEFAULT 0,
    fecha_sincronizacion DATETIME NULL
);
GO

-- Crear índices para mejorar el rendimiento
CREATE INDEX IX_conteo_cuenta ON conteo_inventario(codigo_cuenta);
CREATE INDEX IX_conteo_ubicacion ON conteo_inventario(ubicacion);
CREATE INDEX IX_conteo_sku ON conteo_inventario(sku);
CREATE INDEX IX_conteo_sincronizado ON conteo_inventario(sincronizado);
GO

-- Verificar que se creó correctamente
SELECT 'Base de datos creada correctamente' AS Mensaje;
SELECT * FROM conteo_inventario;
GO
