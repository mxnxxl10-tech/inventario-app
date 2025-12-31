# Guía: Cómo Agregar Exportación a Excel/CSV en tu Aplicación

Esta guía explica paso a paso cómo se implementó la funcionalidad de exportar datos a Excel (formato CSV) en la aplicación de inventario.

---

## 📋 Resumen de lo que hace

La funcionalidad permite exportar la comparación entre el inventario del WMS y el conteo físico a un archivo CSV que se puede abrir en Excel, Google Sheets o cualquier aplicación de hojas de cálculo.

**Datos exportados:**
- SKU del producto
- Descripción
- Ubicación
- Cantidad en WMS
- Cantidad física contada
- Diferencia (Física - WMS)
- Porcentaje de comparación
- Estado (OK, SOBRANTE, FALTANTE)

---

## 🛠️ Implementación Paso a Paso

### **PASO 1: Agregar el Botón de Exportar (HTML)**

**Archivo:** `5-captura-detallada.html`

**Ubicación:** Dentro del `<div class="nav-buttons">` en el header

```html
<div class="nav-buttons">
    <!-- Botón de exportar -->
    <button id="exportar-excel-btn" class="nav-btn export-btn">📊 EXPORTAR A EXCEL</button>
    
    <button id="accept-conteo-btn" class="nav-btn" disabled>✓ ACEPTAR CONTEO</button>
    <button id="cerrar-btn" class="nav-btn close-btn">✖ CERRAR INVENTARIO</button>
</div>
```

**Opcional:** Agregar estilos CSS para el botón:

```css
.export-btn {
    background: linear-gradient(135deg, #43a047 0%, #66bb6a 100%);
    font-weight: bold;
}

.export-btn:hover {
    background: linear-gradient(135deg, #388e3c 0%, #43a047 100%);
    transform: scale(1.05);
}
```

---

### **PASO 2: Crear el Endpoint en el Backend**

**Archivo:** `server-wms-real.js`

**Ubicación:** Después de los otros endpoints (alrededor de la línea 520)

```javascript
// Endpoint para consultar conteo guardado de un SKU específico
app.post('/api/consultar-conteo-sku', async (req, res) => {
  try {
    const { cuenta, ubicacion, sku } = req.body;
    
    const poolLocal = await connectLocal();
    const result = await poolLocal.request()
      .input('cuenta', sql.VarChar, cuenta)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('sku', sql.VarChar, sku)
      .query(`
        SELECT TOP 1 r.cantidad_contada 
        FROM REGISTROS_CONTEO_FISICO r
        INNER JOIN SESIONES_CONTEO_FISICO s ON r.id_sesion = s.id_sesion
        WHERE s.nombre_cuenta = @cuenta 
          AND s.ubicacion_escaneada = @ubicacion 
          AND r.id_producto = @sku
        ORDER BY s.fecha_inicio DESC
      `);
    
    if (result.recordset.length > 0) {
      res.json({ 
        success: true, 
        cantidad: result.recordset[0].cantidad_contada 
      });
    } else {
      res.json({ 
        success: false, 
        cantidad: 0 
      });
    }
    
  } catch (err) {
    console.error('Error al consultar conteo:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});
```

**¿Qué hace este endpoint?**
- Recibe: cuenta, ubicación y SKU
- Busca en la base de datos local el último conteo guardado para ese SKU
- Retorna la cantidad contada o 0 si no existe

---

### **PASO 3: Agregar la Lógica JavaScript de Exportación**

**Archivo:** `5-captura-detallada.html`

**Ubicación:** Dentro del `<script>` al final del archivo, después de los otros event listeners

```javascript
// Botón de exportar a Excel/CSV
document.getElementById('exportar-excel-btn').addEventListener('click', async function() {
    try {
        const cuenta = context?.cuenta || 'Desconocida';
        const ubicacion = ubicacion_escaneada || '';
        const skuActual = sku || '';
        
        if (!skuActual) {
            alert('No hay SKU para exportar');
            return;
        }
        
        // 1. OBTENER CANTIDAD FÍSICA GUARDADA EN LA BASE DE DATOS
        let cantidadFisica = 0;
        
        try {
            const response = await fetch('http://localhost:3000/api/consultar-conteo-sku', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cuenta, ubicacion, sku: skuActual })
            });
            
            if (response.ok) {
                const conteoData = await response.json();
                if (conteoData.success && conteoData.cantidad > 0) {
                    cantidadFisica = conteoData.cantidad;
                }
            }
        } catch (err) {
            console.log('No se pudo obtener de BD, usando input');
        }
        
        // 2. SI NO SE ENCONTRÓ EN BD, TOMAR DEL INPUT
        if (cantidadFisica === 0) {
            const cantidadInput = document.getElementById('field-cantidadFisica');
            cantidadFisica = cantidadInput ? parseInt(cantidadInput.value) || 0 : 0;
        }
        
        // 3. OBTENER DATOS DEL WMS
        const resultWMS = await window.appApi.consultarInventario(ubicacion, skuActual);
        const cantidadWMS = resultWMS?.data?.cantidad || 0;
        const descripcion = resultWMS?.data?.descripcion || 'Sin descripción';
        const ubicacionWMS = resultWMS?.data?.ubicacion || ubicacion;
        
        // 4. CALCULAR DIFERENCIA Y PORCENTAJE
        const diferencia = cantidadFisica - cantidadWMS;
        let porcentaje = 0;
        let estado = 'OK';
        
        if (cantidadWMS > 0) {
            porcentaje = ((cantidadFisica / cantidadWMS) * 100).toFixed(2);
            if (porcentaje < 100) {
                estado = 'FALTANTE';
            } else if (porcentaje > 100) {
                estado = 'SOBRANTE';
            }
        } else {
            porcentaje = cantidadFisica > 0 ? '∞' : '0';
            estado = cantidadFisica > 0 ? 'SOBRANTE' : 'OK';
        }
        
        // 5. CREAR CONTENIDO CSV
        const BOM = '\uFEFF'; // BOM para que Excel reconozca UTF-8
        let csvContent = BOM;
        csvContent += `Comparación de Inventario - ${cuenta}\n`;
        csvContent += `Fecha,${new Date().toLocaleString('es-MX')}\n`;
        csvContent += `Ubicación,${ubicacion}\n`;
        csvContent += `\n`;
        csvContent += `SKU,Descripción,Ubicación,Cantidad WMS,Cantidad Física,Diferencia,% Comparación,Estado\n`;
        csvContent += `${skuActual},"${descripcion}",${ubicacionWMS},${cantidadWMS},${cantidadFisica},${diferencia},${porcentaje}%,${estado}\n`;
        
        // 6. CREAR BLOB Y DESCARGAR
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const fecha = new Date().toISOString().slice(0,10).replace(/-/g, '');
        link.setAttribute('href', url);
        link.setAttribute('download', `Comparacion_${skuActual}_${fecha}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert(`✓ Archivo CSV exportado\n\nSKU: ${skuActual}\nDiferencia: ${diferencia}\nEstado: ${estado}\n\nPuedes abrirlo con Excel, Google Sheets o cualquier app de hojas de cálculo.`);
        
    } catch (error) {
        console.error('Error al exportar:', error);
        alert('Error al exportar a Excel: ' + error.message);
    }
});
```

**Explicación del código:**

1. **Obtener cantidad física:** Primero intenta buscar en la BD local, si no existe toma el valor del input actual
2. **Consultar WMS:** Obtiene la cantidad teórica del sistema WMS
3. **Calcular comparación:** Diferencia y porcentaje entre físico y teórico
4. **Generar CSV:** Crea el contenido en formato CSV con encabezados
5. **Descargar archivo:** Crea un blob y lo descarga automáticamente

---

## 📊 Formato del Archivo CSV Generado

```csv
Comparación de Inventario - Filorga
Fecha,9/12/2025, 14:30:25
Ubicación,22343

SKU,Descripción,Ubicación,Cantidad WMS,Cantidad Física,Diferencia,% Comparación,Estado
TS11331AAA,"Tester Global Repair Elixir 30ml",22343,88,90,2,102.27%,SOBRANTE
```

**Nombre del archivo:** `Comparacion_TS11331AAA_20251209.csv`

---

## 🔧 Personalización

### Cambiar las columnas exportadas

Modifica la línea de encabezados y datos:

```javascript
// Encabezados
csvContent += `SKU,Descripción,Lote,Fecha Caducidad,Cantidad\n`;

// Datos
csvContent += `${skuActual},"${descripcion}",${lote},${fecha},${cantidad}\n`;
```

### Exportar múltiples SKUs

Para exportar varios productos a la vez, modifica la lógica para iterar sobre un array:

```javascript
const productos = [...]; // Array de productos

productos.forEach(prod => {
    csvContent += `${prod.sku},"${prod.descripcion}",${prod.ubicacion},${prod.cantidadWMS},${prod.cantidadFisica}\n`;
});
```

### Cambiar formato de fecha

Para formato diferente:

```javascript
// Formato ISO: 2025-12-09
const fecha = new Date().toISOString().slice(0,10);

// Formato personalizado: 09/12/2025
const fecha = new Date().toLocaleDateString('es-MX');

// Formato completo: 09/12/2025 14:30:25
const fecha = new Date().toLocaleString('es-MX');
```

---

## 🐛 Solución de Problemas

### Problema 1: El archivo no se descarga

**Causa:** El navegador bloquea las descargas automáticas

**Solución:** Verifica que el sitio tenga permisos de descarga en la configuración del navegador

### Problema 2: Excel no abre el archivo correctamente

**Causa:** Problemas con codificación de caracteres

**Solución:** Asegúrate de incluir el BOM (Byte Order Mark):
```javascript
const BOM = '\uFEFF';
let csvContent = BOM + 'tu contenido...';
```

### Problema 3: La cantidad física siempre es 0

**Causa:** El endpoint no encuentra el registro o no se ha guardado

**Solución:** 
1. Verifica que el servidor esté corriendo
2. Asegúrate de guardar el conteo antes de exportar
3. Revisa la consola del navegador para ver errores

### Problema 4: Caracteres especiales aparecen mal

**Causa:** Encoding incorrecto

**Solución:** Usa UTF-8 con BOM y type correcto:
```javascript
const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
```

---

## 📱 Compatibilidad

✅ **Escritorio:**
- Windows: Excel 2010+
- macOS: Excel, Numbers
- Linux: LibreOffice Calc

✅ **Móvil:**
- Android: Excel, Google Sheets, WPS Office
- iOS: Excel, Numbers, Google Sheets

✅ **Online:**
- Google Sheets
- Microsoft Excel Online
- Zoho Sheet

---

## 🎯 Siguientes Pasos

Para mejorar la funcionalidad puedes:

1. **Exportar múltiples productos:** Agregar opción para exportar toda la sesión de conteo
2. **Agregar gráficos:** Usar bibliotecas como Chart.js para generar imágenes
3. **Formato Excel nativo:** Usar bibliotecas como `xlsx` o `exceljs` para generar archivos .xlsx
4. **Envío por email:** Integrar con un servicio de email para enviar el reporte automáticamente
5. **Historial de exportaciones:** Guardar registro de exportaciones realizadas

---

## 📚 Recursos Adicionales

- [MDN: Blob](https://developer.mozilla.org/es/docs/Web/API/Blob)
- [MDN: URL.createObjectURL](https://developer.mozilla.org/es/docs/Web/API/URL/createObjectURL)
- [Formato CSV - RFC 4180](https://tools.ietf.org/html/rfc4180)
- [SheetJS (xlsx library)](https://sheetjs.com/)

---

**Fecha de creación:** 9 de diciembre de 2025  
**Versión:** 1.0  
**Autor:** Sistema de Inventario Recsolog
