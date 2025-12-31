-- Script para crear tabla de usuarios con roles
USE inventario_app;
GO

-- Crear tabla de usuarios si no existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[USUARIOS]') AND type in (N'U'))
BEGIN
    CREATE TABLE USUARIOS (
        id_usuario INT IDENTITY(1,1) PRIMARY KEY,
        nombre_usuario VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nombre_completo VARCHAR(100) NOT NULL,
        rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Operador')),
        activo BIT DEFAULT 1,
        fecha_creacion DATETIME DEFAULT GETDATE(),
        fecha_ultimo_acceso DATETIME NULL
    );
    
    PRINT 'Tabla USUARIOS creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla USUARIOS ya existe';
END
GO

-- Insertar usuarios por defecto
-- Password: admin123 (para ambos usuarios de prueba)
IF NOT EXISTS (SELECT * FROM USUARIOS WHERE nombre_usuario = 'admin')
BEGIN
    INSERT INTO USUARIOS (nombre_usuario, password_hash, nombre_completo, rol)
    VALUES ('admin', 'admin123', 'Administrador Principal', 'Administrador');
    PRINT 'Usuario admin creado';
END

IF NOT EXISTS (SELECT * FROM USUARIOS WHERE nombre_usuario = 'operador')
BEGIN
    INSERT INTO USUARIOS (nombre_usuario, password_hash, nombre_completo, rol)
    VALUES ('operador', 'oper123', 'Operador de Inventario', 'Operador');
    PRINT 'Usuario operador creado';
END
GO

-- Mostrar usuarios creados
SELECT 
    id_usuario,
    nombre_usuario,
    nombre_completo,
    rol,
    activo,
    fecha_creacion
FROM USUARIOS;
GO
