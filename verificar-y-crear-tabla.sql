-- ============================================
-- Verificar y crear tabla conteo_inventario
-- ============================================

USE InventarioLocal;
GO

-- Verificar si la tabla existe
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'conteo_inventario')
BEGIN
    PRINT 'Creando tabla conteo_inventario...';
    
    CREATE TABLE conteo_inventario (
        id INT IDENTITY(1,1) PRIMARY KEY,
        codigo_cuenta NVARCHAR(50) NOT NULL,
        ubicacion NVARCHAR(100) NOT NULL,
        sku NVARCHAR(100) NOT NULL,
        cantidad DECIMAL(18,2) NOT NULL,
        usuario NVARCHAR(100) NOT NULL,
        fecha_conteo DATETIME NOT NULL DEFAULT GETDATE(),
        observaciones NVARCHAR(MAX),
        sincronizado BIT DEFAULT 0,
        fecha_sincronizacion DATETIME NULL
    );

    -- Crear índices
    CREATE INDEX IX_conteo_inventario_sku ON conteo_inventario(sku);
    CREATE INDEX IX_conteo_inventario_ubicacion ON conteo_inventario(ubicacion);
    CREATE INDEX IX_conteo_inventario_fecha ON conteo_inventario(fecha_conteo);

    PRINT '✅ Tabla creada exitosamente';
END
ELSE
BEGIN
    PRINT '✅ La tabla ya existe';
END
GO

-- Verificar estructura
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'conteo_inventario'
ORDER BY ORDINAL_POSITION;
GO
