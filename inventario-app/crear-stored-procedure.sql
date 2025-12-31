-- Crear stored procedure en MASTER para insertar conteos
USE master;
GO

IF EXISTS (SELECT * FROM sys.objects WHERE name = 'sp_InsertarConteo' AND type = 'P')
    DROP PROCEDURE sp_InsertarConteo;
GO

CREATE PROCEDURE sp_InsertarConteo
    @cuenta VARCHAR(50),
    @ubicacion VARCHAR(50),
    @sku VARCHAR(50),
    @loteProveedor VARCHAR(50),
    @cantidadFisica INT,
    @fechaCaducidad DATETIME,
    @usuario VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @id_sesion INT;
    
    -- Insertar sesión
    INSERT INTO inventario_app.dbo.SESIONES_CONTEO_FISICO 
    (id_bodega, id_compania, nombre_cuenta, ubicacion_escaneada, fecha_inicio, fecha_cierre, id_usuario, estado_sesion)
    VALUES 
    ('', '', @cuenta, @ubicacion, GETDATE(), GETDATE(), @usuario, 'COMPLETADO');
    
    -- Obtener el ID de la sesión recién creada
    SET @id_sesion = SCOPE_IDENTITY();
    
    -- Insertar registro
    INSERT INTO inventario_app.dbo.REGISTROS_CONTEO_FISICO
    (id_sesion, id_producto, cantidad_contada, lote_proveedor_fisico, fechacaducidad_fisica)
    VALUES
    (@id_sesion, @sku, @cantidadFisica, @loteProveedor, @fechaCaducidad);
    
    SELECT 'Conteo guardado exitosamente' AS Mensaje, @id_sesion AS ID_Sesion;
END
GO

PRINT 'Stored procedure creado exitosamente';
