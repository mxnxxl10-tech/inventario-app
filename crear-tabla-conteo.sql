-- Script SEGURO para crear SOLO una tabla nueva de conteo
-- Este script NO modifica, NO borra, ni afecta ninguna tabla existente
-- Solo crea una tabla nueva llamada "conteo_inventario_web"
-- Ejecutar este script en tu base de datos Recsolog_wms

-- Verificar si la tabla YA existe para NO duplicarla
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='conteo_inventario_web' AND xtype='U')
BEGIN
    -- Crear SOLO la nueva tabla de conteos (totalmente independiente)
    CREATE TABLE conteo_inventario_web (
        IDConteo INT IDENTITY(1,1) PRIMARY KEY,
        IDCuenta VARCHAR(50) NOT NULL,
        IDUbicacion VARCHAR(50) NOT NULL,
        IDProducto VARCHAR(50) NOT NULL,
        LoteProveedor VARCHAR(100),
        CantidadFisica INT NOT NULL,
        FechaCaducidad DATE,
        FechaConteo DATETIME NOT NULL DEFAULT GETDATE(),
        FechaModificacion DATETIME NULL,
        Usuario VARCHAR(100) DEFAULT 'Sistema',
        
        -- Índices para mejorar el rendimiento
        INDEX IX_Cuenta (IDCuenta),
        INDEX IX_Ubicacion (IDUbicacion),
        INDEX IX_Producto (IDProducto),
        INDEX IX_FechaConteo (FechaConteo)
    );
    
    PRINT '✓ Tabla conteo_inventario_web creada exitosamente';
    PRINT '✓ Ninguna tabla existente fue modificada';
END
ELSE
BEGIN
    PRINT 'ℹ La tabla conteo_inventario_web ya existe';
    PRINT '✓ No se realizaron cambios';
END
GO

-- IMPORTANTE: Este script es 100% seguro
-- - NO hace DROP de ninguna tabla
-- - NO hace DELETE de ningún dato
-- - NO hace UPDATE de ningún registro
-- - Solo CREA una tabla nueva si no existe
