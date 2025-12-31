@echo off
echo ================================================
echo VERIFICANDO DATOS GUARDADOS EN LA BASE DE DATOS
echo ================================================
echo.

echo Contando registros...
sqlcmd -S "(local)" -d master -E -Q "SELECT (SELECT COUNT(*) FROM SESIONES_CONTEO_FISICO) AS Total_Sesiones, (SELECT COUNT(*) FROM REGISTROS_CONTEO_FISICO) AS Total_Registros"

echo.
echo ================================================
echo ULTIMOS 5 CONTEOS GUARDADOS:
echo ================================================
sqlcmd -S "(local)" -d master -E -Q "SELECT TOP 5 s.nombre_cuenta AS Cuenta, s.ubicacion_escaneada AS Ubicacion, r.id_producto AS SKU, r.cantidad_contada AS Cantidad, r.lote_proveedor_fisico AS Lote, s.fecha_inicio AS Fecha FROM SESIONES_CONTEO_FISICO s INNER JOIN REGISTROS_CONTEO_FISICO r ON s.id_sesion = r.id_sesion ORDER BY s.fecha_inicio DESC" -W -s","

pause
