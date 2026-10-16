# Spec 008 — Exportación a CSV y dashboard a PDF

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 004 (movimientos), 006 (dashboard) y 007 (comparación) |

## 1. Objetivo

Que la familia pueda **sacar sus datos** de la aplicación:

- Los **movimientos en un archivo CSV**, para abrirlos en Excel o Google
  Sheets, guardarlos o enviárselos a alguien (un contador, otro familiar).
- El **dashboard en PDF**, para guardar el resumen de un mes o compartirlo.

## 2. Movimientos a CSV

### 2.1 Qué se exporta

Un rango de fechas elegido ("desde" y "hasta"), por defecto el **mes que se
está viendo** en Movimientos. Todos los movimientos de la familia en ese
rango, de cualquier tipo, del más antiguo al más reciente.

| Columna | Ejemplo | Notas |
|---|---|---|
| Fecha | 15/10/2026 | dd/mm/aaaa |
| Tipo | Gasto | Del catálogo |
| Categoría | Alimentación | |
| Descripción | Mercado de la semana | |
| Método de pago | Pago móvil | |
| Monto USD | 45,30 | Gasto con signo menos: −45,30. Es el monto que vale |
| Monto anotado | 18.120,00 | Lo que se escribió |
| Moneda anotada | VES | |
| Tasa usada | 400,00000000 | Bolívares por unidad; vacío si fue en USD |
| Anotado por | Luis Demo | |

### 2.2 Formato

Pensado para que **Excel en español lo abra bien con doble clic**:

- Separador **punto y coma** (`;`), porque en español la coma es el decimal.
- Decimales con **coma** y sin separador de miles en los números ("18120,00"),
  para que Excel los lea como números y se puedan sumar.
- Codificación **UTF-8 con BOM**, para que salgan bien las tildes y la ñ.
- Nombre del archivo: `movimientos-2026-10-01-a-2026-10-31.csv`.
- Primera fila con los nombres de las columnas.

### 2.3 Reglas

1. Cualquier miembro puede exportar (el lector ya puede ver los movimientos).
2. Solo los movimientos de su familia.
3. Rango válido: "desde" no puede ser posterior a "hasta", ni anterior al
   año 2000, y el rango es de **un año como máximo** (366 días).
4. Los valores que empiezan por `=`, `+`, `-` o `@` (en descripciones o
   nombres) se escriben con un apóstrofo delante, para que Excel no los
   ejecute como fórmulas (inyección de fórmulas en CSV).

### 2.4 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET movements/export/?from=2026-10-01&to=2026-10-31` | Cualquier miembro | Devuelve el CSV como descarga |

Un rango mal escrito responde `400` con el mensaje en JSON, como el resto de
la API.

### 2.5 Frontend

En **Movimientos**, un botón **"Exportar"** (icono de descarga) junto al
selector de mes. Abre un modal con:

- "Desde" y "Hasta" en dd/mm/aaaa (con el mismo campo de fecha de siempre),
  rellenos con el primer y el último día del mes que se ve.
- Atajos: "Este mes", "Mes anterior", "Este año".
- Botón "Descargar CSV". Los errores salen junto a su campo.

## 3. Dashboard a PDF

### 3.1 Cómo

Con la **impresión del navegador**: un botón **"Descargar PDF"** en Inicio
abre el diálogo de imprimir, donde se elige "Guardar como PDF". Funciona en
Chrome, Edge, Firefox y Safari, también en el móvil (en Android: Compartir →
Imprimir; en iPhone: Compartir → Imprimir → pellizcar la vista previa).

Sin librerías: los gráficos son HTML, así que se imprimen nítidos (no como
captura de pantalla) y el texto se puede seleccionar y buscar en el PDF.

### 3.2 Qué sale en el PDF

Una hoja de estilo de impresión (`@media print`) prepara la página:

- **Encabezado**: "Finanzas Familiares · Familia Demo · Octubre de 2026 ·
  Montos en USD", la tasa usada si es otra moneda, y la fecha en que se
  generó.
- Las cifras del mes con su cambio, "Qué cambió", "Últimos 6 meses", "Gastos
  por categoría", "Gastos por día", "Gastos por método de pago" y "Los
  gastos más grandes", tal como se ven.
- **Se ocultan**: la barra de navegación, los botones (selector de mes y
  moneda, "Ver como tabla", enlaces), el aviso del presupuesto y el detalle
  de la columna elegida.
- Tamaño carta o A4 en vertical, en blanco y negro legible: los colores se
  conservan (`print-color-adjust: exact`) pero nada depende solo del color.
- Cada bloque evita partirse entre dos páginas (`break-inside: avoid`).
- Sin animaciones: al imprimir todo aparece ya en su sitio.

El título del documento pasa a ser "Finanzas Familiares - Octubre de 2026",
que es el nombre que el navegador propone para el archivo PDF.

## 4. Fuera de alcance

- Exportar el presupuesto (spec 010) o los catálogos.
- Exportar a Excel (`.xlsx`): el CSV ya lo abre Excel.
- Importar desde CSV.
- Enviar el PDF por correo o programar envíos.
- Un PDF generado en el servidor.

## 5. Criterios de aceptación

**CSV**

1. Cualquier miembro descarga el CSV del rango pedido, con las columnas de la
   sección 2.1 en ese orden y una fila por movimiento, del más antiguo al más
   reciente.
2. El archivo abre en Excel en español con doble clic: columnas separadas,
   tildes bien, y los montos como números con coma decimal.
3. Los gastos llevan signo menos en "Monto USD"; la tasa está vacía en los
   movimientos en USD.
4. Solo aparecen movimientos de la familia; sin sesión responde `401`.
5. Rango invertido, anterior al 2000, de más de 366 días o mal escrito:
   `400` con mensaje en español.
6. Una descripción que empieza por `=` sale con un apóstrofo delante.

**PDF**

7. "Descargar PDF" abre el diálogo de imprimir y el PDF muestra el encabezado
   y todos los bloques del dashboard, sin barra de navegación ni botones.
8. Ningún bloque queda cortado entre dos páginas, y el PDF se lee bien
   también en blanco y negro.
9. El nombre propuesto para el archivo incluye el mes.

**Pantalla**

10. El modal de exportar y el botón de PDF se usan bien en el móvil
    (360 a 430 px), con botones de 44 px.

**Pruebas**

11. Hay pruebas automáticas del backend para los criterios 1 a 6, y pasan.

## 6. Decisiones a revisar

1. **CSV con punto y coma y coma decimal**, para Excel en español. Si alguien
   lo abre en un programa en inglés tendrá que elegir el separador; Google
   Sheets lo detecta solo.
2. **Montos en USD** (el que vale) más lo que se anotó y su tasa. No se añade
   una columna en bolívares con la tasa de hoy: en un archivo que se guarda,
   esa cifra quedaría vieja enseguida.
3. **El PDF sale de la impresión del navegador** y no de una librería: no
   aumenta el tamaño de la aplicación (que ya pasa de 500 KB) y el PDF queda
   nítido. A cambio, hay que pulsar "Guardar como PDF" en el diálogo.
4. **Rango máximo de un año** en el CSV.
5. **Cualquier miembro exporta**, también el lector.
