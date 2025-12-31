@echo off
echo ================================================
echo Habilitando TCP/IP en SQL Server y reiniciando
echo ================================================
echo.
echo IMPORTANTE: Ejecuta este archivo como ADMINISTRADOR
echo (Click derecho -> Ejecutar como administrador)
echo.
pause

net stop MSSQLSERVER
timeout /t 3
net start MSSQLSERVER

echo.
echo ================================================
echo TCP/IP habilitado y servicio reiniciado
echo ================================================
pause
