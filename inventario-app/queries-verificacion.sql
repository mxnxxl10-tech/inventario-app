-- =========================================================
-- QUERIES PARA VERIFICAR DATOS GUARDADOS EN LA BASE DE DATOS
-- Base de datos: inventario_app
-- =========================================================

-- 1. VER TODAS LAS SESIONES DE CONTEO (últimas 20)
SELECT TOP 20 
    id_sesion,
    id_bodega,
    id_compania,
    nombre_cuenta,
    ubicacion_escaneada,
    fecha_inicio,
    fecha_cierre,
    id_usuario,
    estado_sesion
FROM dbo.SESIONES_CONTEO_FISICO
ORDER BY fecha_inicio DESC;

-- 2. VER TODOS LOS REGISTROS DE CONTEO (últimas 20)
SELECT TOP 20 
    id_registro,
    id_sesion,
    id_producto,
    cantidad_contada,
    lote_proveedor_fisico,
    fechacaducidad_fisica
FROM dbo.REGISTROS_CONTEO_FISICO
ORDER BY id_registro DESC;

-- 3. ⭐ VER CONTEOS COMPLETOS (Sesión + Registros) - RECOMENDADO ⭐
SELECT 
    s.id_sesion,
    s.id_bodega,
    s.id_compania,
    s.nombre_cuenta,
    s.ubicacion_escaneada,
    s.fecha_inicio,
    s.fecha_cierre,
    s.id_usuario,
    s.estado_sesion,
    r.id_registro,
    r.id_producto AS SKU,
    r.cantidad_contada,
    r.lote_proveedor_fisico,
    r.fechacaducidad_fisica
FROM dbo.SESIONES_CONTEO_FISICO s
LEFT JOIN dbo.REGISTROS_CONTEO_FISICO r ON s.id_sesion = r.id_sesion
ORDER BY s.fecha_inicio DESC;

-- 4. CONTAR CUÁNTOS REGISTROS HAY
SELECT 
    (SELECT COUNT(*) FROM dbo.SESIONES_CONTEO_FISICO) AS Total_Sesiones,
    (SELECT COUNT(*) FROM dbo.REGISTROS_CONTEO_FISICO) AS Total_Registros;

-- 5. VER CONTEOS DE HOY
SELECT 
    s.id_sesion,
    s.nombre_cuenta,
    s.ubicacion_escaneada,
    s.id_usuario,
    s.fecha_inicio,
    r.id_producto AS SKU,
    r.cantidad_contada,
    r.lote_proveedor_fisico,
    r.fechacaducidad_fisica
FROM dbo.SESIONES_CONTEO_FISICO s
LEFT JOIN dbo.REGISTROS_CONTEO_FISICO r ON s.id_sesion = r.id_sesion
WHERE CAST(s.fecha_inicio AS DATE) = CAST(GETDATE() AS DATE)
ORDER BY s.fecha_inicio DESC;

-- 6. VER CONTEOS POR CUENTA
SELECT 
    nombre_cuenta,
    COUNT(*) AS Total_Conteos,
    MIN(fecha_inicio) AS Primer_Conteo,
    MAX(fecha_inicio) AS Ultimo_Conteo
FROM dbo.SESIONES_CONTEO_FISICO
GROUP BY nombre_cuenta
ORDER BY Total_Conteos DESC;

-- 7. VER CONTEOS POR UBICACIÓN
SELECT 
    ubicacion_escaneada,
    COUNT(*) AS Total_Conteos
FROM dbo.SESIONES_CONTEO_FISICO
GROUP BY ubicacion_escaneada
ORDER BY Total_Conteos DESC;

-- 8. ⭐ VER ÚLTIMO CONTEO REGISTRADO ⭐
SELECT TOP 1 
    s.id_sesion,
    s.nombre_cuenta,
    s.ubicacion_escaneada,
    s.id_usuario,
    s.fecha_inicio,
    s.estado_sesion,
    r.id_registro,
    r.id_producto AS SKU,
    r.cantidad_contada,
    r.lote_proveedor_fisico,
    r.fechacaducidad_fisica
FROM dbo.SESIONES_CONTEO_FISICO s
LEFT JOIN dbo.REGISTROS_CONTEO_FISICO r ON s.id_sesion = r.id_sesion
ORDER BY s.fecha_inicio DESC;

-- 9. ELIMINAR TODOS LOS DATOS (¡USAR CON CUIDADO!)
-- DELETE FROM dbo.REGISTROS_CONTEO_FISICO;
-- DELETE FROM dbo.SESIONES_CONTEO_FISICO;

-- 10. VER ESTRUCTURA DE LAS TABLAS
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME IN ('SESIONES_CONTEO_FISICO', 'REGISTROS_CONTEO_FISICO')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
