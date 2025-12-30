/* --- scripts/app.js (Lógica Global Únicamente) --- */

/**
 * Función de Autenticación Global (Usada en 1-login.html)
 * @param {string} username 
 * @param {string} password 
 */
async function authenticateUser(username, password) {
    // FUTURO: Aquí irá tu conexión real a SQL
    
    if (username === 'admin' && password === '1234') {
        localStorage.setItem('currentUser', username);
        
        // Redirige a la PANTALLA 2 (Selección de Cuenta)
        window.location.href = '2-seleccion-cuenta.html'; 
        return true;
    } else {
        alert('Usuario o contraseña incorrectos.');
        return false;
    }
}

// Puedes añadir aquí otras funciones de utilidad global, como saveConteo.