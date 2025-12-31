/* --- scripts/app.js (Lógica Global Únicamente) --- */

/**
 * Función de Autenticación Global (Usada en 1-login.html)
 * @param {string} username 
 * @param {string} password 
 */
async function authenticateUser(username, password) {
    // Permitir acceso local inmediato para las credenciales legacy admin/1234
    if (username === 'admin' && password === '1234') {
        localStorage.setItem('currentUser', username);
        window.location.href = '2-seleccion-cuenta.html';
        return true;
    }

    // Llamar al endpoint de autenticación del backend
    try {
        const resp = await fetch('/api/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await resp.json();
        if (data && data.success) {
            // Guardar usuario y session_id opcional
            localStorage.setItem('currentUser', username);
            if (data.session_id) localStorage.setItem('current_session', data.session_id);
            window.location.href = '2-seleccion-cuenta.html';
            return true;
        } else {
            // Si la BD remota indica que el usuario no existe, permitir el usuario local original
            // (comportamiento previo) para que 'admin' / '1234' siga funcionando.
            const remoteMessage = data && data.message ? data.message.toString().toLowerCase() : '';
            if (remoteMessage.includes('usuario no encontrado') || resp.status === 401) {
                if (username === 'admin' && password === '1234') {
                    localStorage.setItem('currentUser', username);
                    window.location.href = '2-seleccion-cuenta.html';
                    return true;
                }
            }

            alert(data && data.message ? data.message : 'Usuario o contraseña incorrectos.');
            return false;
        }
    } catch (err) {
        console.error('Error autenticando:', err);
        // Si hay error de conexión, también permitir el usuario local tradicional
        if (username === 'admin' && password === '1234') {
            localStorage.setItem('currentUser', username);
            window.location.href = '2-seleccion-cuenta.html';
            return true;
        }
        alert('Error de conexión con el servidor. Intente nuevamente.');
        return false;
    }
}

// API helpers
async function buscarSku(sku) {
    try {
        const res = await fetch(`/api/buscar-sku/${encodeURIComponent(sku)}`);
        return await res.json();
    } catch (e) {
        console.error('Error buscarSku:', e);
        return { success: false, error: e.message };
    }
}

async function validarUbicacion(ubicacion) {
    try {
        const res = await fetch('/api/validar-ubicacion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ubicacion })
        });
        return await res.json();
    } catch (e) {
        console.error('Error validarUbicacion:', e);
        return { success: false, error: e.message };
    }
}

async function consultarInventario(ubicacion, sku, cuentaEsperada = null) {
    try {
        const res = await fetch('/api/consultar-inventario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ubicacion, sku, cuentaEsperada })
        });
        return await res.json();
    } catch (e) {
        console.error('Error consultarInventario:', e);
        return { success: false, error: e.message };
    }
}

async function guardarConteo(payload) {
    try {
        const res = await fetch('/api/guardar-conteo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        console.error('Error guardarConteo:', e);
        return { success: false, error: e.message };
    }
}

// Export helpers to global scope for usage in inline scripts
window.appApi = {
    authenticateUser,
    buscarSku,
    validarUbicacion,
    consultarInventario,
    guardarConteo
};