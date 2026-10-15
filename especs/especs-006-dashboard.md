# Spec 006 — Dashboard interactivo

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 004 (movimientos) y spec 005 (tasas y monedas) |
| **Desbloquea** | Spec 007 (comparación con meses anteriores) y 008 (dashboard a PDF) |

## 1. Objetivo

Que la familia vea de un vistazo, en la pantalla de **Inicio**, cómo va el mes
y **en qué se le va el dinero**.

Al terminar esta spec cualquier miembro abre la aplicación y ve cuánto entró,
cuánto salió y cuánto queda; en qué categorías gasta más; qué días gastó más;
con qué medios paga, y cuáles fueron los gastos más grandes. Desde una
categoría puede saltar a la lista de sus movimientos.

Todo es de **un mes**. Comparar con meses anteriores es de la spec 007.

## 2. Qué muestra

De arriba abajo, en una sola columna en el móvil:

| Bloque | Pregunta que responde | Forma |
|---|---|---|
| Cifras del mes | ¿Cuánto entró, cuánto salió, cuánto queda? | Tres cifras grandes (no es un gráfico) |
| Gastos por categoría | ¿En qué se va el dinero? | Barras horizontales, de mayor a menor |
| Gastos por día | ¿Qué días gastamos más? | Columnas, una por día del mes |
| Gastos por método de pago | ¿Con qué pagamos? | Barras horizontales, de mayor a menor |
| Los gastos más grandes | ¿Qué movimientos pesan más? | Lista de los 5 mayores |

En escritorio, "por categoría" y "por método de pago" van lado a lado.

Por qué estas formas (guía de visualización del proyecto):

- **Barras horizontales** para comparar cantidades con nombres largos
  ("Ropa y calzado"). Se leen mejor que una torta, sobre todo en el móvil.
- **Un solo color** (azul `primary`) en todas las barras: lo que importa es el
  tamaño, no distinguir series. Así no hacen falta leyendas ni paletas, y el
  verde y el rojo quedan solo para ingresos y gastos en las cifras.
- **Columnas por día** para ver los picos del mes.
- Ningún gráfico tiene dos ejes.

## 3. Alcance

### 3.1 Reglas

1. Cualquier miembro ve el dashboard, también el lector.
2. Solo se cuentan los movimientos de la familia del usuario.
3. Los montos se ven en USD, bolívares o euros, **con la tasa de hoy**, igual
   que en Movimientos (spec 005). Se suma en USD y se convierte cada total.
4. Los porcentajes se calculan en USD, así no cambian con la moneda.
5. Las categorías y métodos de pago desactivados también aparecen si tienen
   gastos en ese mes: el dinero se gastó igual.
6. Solo aparecen categorías y métodos con gastos en el mes. Si hay más de 8
   categorías con gastos, las más pequeñas se juntan en una barra "Resto (N
   categorías)".

### 3.2 API

Nueva ruta, en la app `movements` (usa sus mismos datos y filtros):

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET movements/summary/` | Cualquier miembro | Resumen de un mes para el dashboard |

Parámetros, los mismos que la lista de movimientos y con la misma validación:
`month` (si falta, el actual) y `currency` (si falta, USD). Sin tasa, pedirlo
en otra moneda responde `400`, igual que en la lista.

```json
{
  "month": "2026-10",
  "currency": "VES",
  "rate": { "date": "2026-10-14", "status": "current", "rates": [...] },
  "totals": { "income": "1053480.00", "expense": "742115.70", "balance": "311364.30" },
  "by_category": [
    { "id": 7, "name": "Alimentación", "amount": "263370.00", "percent": "35.5", "count": 12 }
  ],
  "by_day": [
    { "date": "2026-10-01", "amount": "17557.80", "count": 2 }
  ],
  "by_payment_method": [
    { "id": 3, "name": "Pago móvil", "amount": "351150.00", "percent": "47.3", "count": 9 }
  ],
  "top_expenses": [
    { "id": 31, "date": "2026-10-05", "amount": "175580.00", "description": "Alquiler",
      "category": { "id": 2, "name": "Vivienda" } }
  ]
}
```

- `by_category` y `by_payment_method`: solo gastos, de mayor a menor. El
  agrupado en "Resto" lo hace el frontend (es solo cómo se dibuja).
- `by_day`: solo los días con gastos, en orden de fecha. El frontend completa
  los días sin gastos con cero.
- `percent`: parte del total de gastos, con un decimal, como texto.
- `top_expenses`: los 5 gastos con monto mayor (en USD), y a igual monto el
  más reciente.
- Los montos viajan como texto, como en el resto de la API.

### 3.3 Frontend

**Inicio (`/`)** pasa a ser el dashboard. Se quitan las tarjetas de "Familia" y
"Tu rol" (siguen en Miembros y en la barra superior) y el acceso a
Movimientos se queda como botón.

- **Arriba**: el saludo, el selector de mes (el mismo `MonthPicker`) y el
  selector de moneda ($ · € · Bs.) con la línea de la tasa y sus avisos
  (`RateInfo`). La moneda elegida es **la misma que en Movimientos**: si la
  cambias en una pantalla, la otra la recuerda.
- **Cifras del mes**: Ingresos, Gastos y Balance, con icono y signo (no solo
  color). Las cifras cuentan hasta su valor al cargar y al cambiar de mes o
  moneda. Debajo del balance: "Gastaste el 70 % de lo que entró" (o "Gastaste
  más de lo que entró" si el balance es negativo; nada si no hubo ingresos).
- **Gastos por categoría**: cada fila muestra el nombre, la barra, el monto y
  el porcentaje, escritos al lado (no hace falta pasar el cursor). **Tocar una
  categoría abre Movimientos** de ese mes filtrado por ella.
- **Gastos por día**: una columna por día del mes; los días que aún no han
  llegado se ven vacíos. Al pasar el cursor o tocar una columna aparece "Martes
  13 de octubre: $45,30 en 3 gastos". El día de más gasto lleva su monto
  escrito encima. Un botón **"Ver como tabla"** muestra los mismos datos en una
  tabla (para lectores de pantalla y para quien prefiera números).
- **Gastos por método de pago**: como el de categorías, sin enlace.
- **Los gastos más grandes**: los 5 mayores, con fecha, categoría, descripción y
  monto. Tocar uno abre Movimientos en ese mes.
- **Mes sin movimientos**: un mensaje y, si puede anotar, el botón "Registrar
  movimiento" que lleva a Movimientos.
- **Mes con ingresos pero sin gastos**: las cifras se ven, y en lugar de los
  gráficos un mensaje "Este mes no hay gastos anotados".

**Movimientos** acepta abrirse con `?mes=2026-10&categoria=7`. Con categoría,
muestra arriba de la lista una etiqueta "Categoría: Alimentación" con un botón
para quitarla. Es el filtro `category` que la API ya tiene (spec 004).

**Gráficos**: se dibujan con HTML, Tailwind y Motion, sin librería de gráficos
(ver decisión 1). Componentes nuevos en `frontend/src/components/`:

- `StatNumber`: cifra que cuenta hasta su valor.
- `BarList`: lista de barras horizontales con nombre, monto y porcentaje.
- `DailyChart`: columnas por día, con su tooltip y su tabla.

Animaciones, con los valores de `lib/motion.js`:

- Las barras crecen desde cero al cargar y al cambiar de mes o de moneda
  (con `scaleX` y `scaleY`: solo `transform`).
- Los bloques entran escalonados.
- Las cifras cuentan hasta su valor en unos 300 ms.
- Esqueletos mientras carga.
- Con "reducir movimiento", todo aparece directamente en su sitio.

### 3.4 En el móvil

El móvil es donde más se usa la aplicación, así que todo el dashboard se
diseña primero para él (de 360 a 430 px de ancho) y después se amplía.

- Una sola columna, sin desplazamiento horizontal en ningún ancho.
- **Cifras**: en el móvil son filas (etiqueta a la izquierda, cifra a la
  derecha), como los totales de Movimientos, para que quepan las cifras largas
  en bolívares ("Bs. 1.053.480,00"). Desde `sm` son tarjetas.
- **Barras**: el nombre y el monto van en una línea encima de la barra, y el
  porcentaje a la derecha de la barra. Así caben las cifras en bolívares sin
  cortar nombres como "Entretenimiento". Un nombre muy largo, creado por la
  familia, se corta con "…".
- **Columnas por día**: las 31 caben en 360 px sin desplazamiento. Como no hay
  cursor, el detalle aparece al **tocar** la columna y se queda fijo debajo del
  gráfico hasta tocar otra; nada depende solo de pasar el cursor. La zona que
  se toca es toda la altura del gráfico, no solo la columna.
- **Tamaño táctil**: filas de categoría, botones y gastos más grandes de 44 px
  de alto como mínimo.
- El contenido no queda tapado por la barra de navegación inferior.

### 3.5 Datos de ejemplo

No cambia nada: los movimientos de `seed_demo` (spec 004) ya llenan tres meses.

## 4. Fuera de alcance

- Comparar con meses anteriores o ver tendencias de varios meses (spec 007).
- Exportar el dashboard a PDF (spec 008).
- Ingresos por categoría (el dashboard se centra en los gastos, que es donde
  están las fugas).
- Presupuestos, metas de ahorro y alertas de "te pasaste".
- Gastos por miembro de la familia.
- Elegir un rango de fechas distinto de un mes.
- Modo oscuro.

## 5. Criterios de aceptación

**API**

1. Cualquier miembro (también el lector) obtiene el resumen del mes pedido, y
   sin `month` el del mes actual.
2. Los totales coinciden con los de `GET movements/` para el mismo mes y
   moneda.
3. `by_category` y `by_payment_method` suman el total de gastos (en USD), van
   de mayor a menor, no incluyen ingresos e incluyen categorías y métodos
   desactivados que tengan gastos.
4. Los porcentajes son iguales en las tres monedas.
5. `by_day` tiene un elemento por día con gastos y su suma es el total de
   gastos.
6. `top_expenses` trae como mucho 5 gastos, de mayor a menor, y ningún ingreso.
7. Con `currency=VES` o `EUR` los montos van convertidos con la tasa de hoy; sin
   tasa responde `400`.
8. Un mes o una moneda mal escritos responden `400`.
9. Nunca aparecen datos de otra familia. Sin sesión responde `401`.

**Frontend**

10. Inicio muestra las cifras, los tres gráficos y los gastos más grandes del
    mes, y se actualiza al cambiar de mes o de moneda.
11. La moneda elegida en Inicio se mantiene al ir a Movimientos, y al revés.
12. Tocar una categoría abre Movimientos con ese mes y esa categoría; quitar la
    etiqueta vuelve a mostrar todos.
13. En "Gastos por día" el tooltip muestra día, monto y número de gastos, y
    "Ver como tabla" muestra los mismos datos.
14. Un mes sin movimientos y un mes sin gastos muestran su mensaje.
15. Las animaciones de la sección 3.3 funcionan y se desactivan con "reducir
    movimiento".
16. Todo el dashboard se ve y se usa bien en el móvil (de 360 a 430 px):
    sin desplazamiento horizontal, cifras en bolívares completas, detalle del
    día al tocar y zonas táctiles de 44 px, como dice la sección 3.4.
17. El color nunca es la única señal: cada barra tiene su nombre y su monto
    escritos.

**Pruebas**

18. Hay pruebas automáticas del backend para los criterios 1 a 9, y pasan.

## 6. Decisiones a revisar

1. **Sin Recharts.** La hoja de ruta lo dejaba "a confirmar". Estos gráficos
   son solo barras, que se hacen con unas pocas líneas de HTML y Tailwind.
   Recharts anima cambiando el ancho y el alto (la regla del proyecto es animar
   solo `opacity` y `transform`), pesa unos 100 KB y sus textos son más
   difíciles de hacer accesibles. Si la spec 007 necesita líneas de varios
   meses, se vuelve a valorar ahí.
2. **El dashboard reemplaza la pantalla de Inicio**, en vez de ser una pantalla
   nueva. Así la familia lo ve nada más entrar y la barra del móvil no gana un
   sexto enlace.
3. **Solo gastos en los gráficos.** Los ingresos aparecen en las cifras del
   mes, no por categoría.
4. **Un solo color para todas las barras** (azul), en lugar de un color por
   categoría.
5. **Más de 8 categorías se agrupan en "Resto"**, para que la lista no se
   alargue en el móvil. Las familias empiezan con 9 categorías de gasto.
6. **La moneda se comparte entre Inicio y Movimientos** (la misma clave de
   `localStorage`).
7. **La ruta va en la app `movements`** (`movements/summary/`) y no en una app
   nueva: son los mismos datos con otra forma.

Decididas durante la implementación:

8. **Dos componentes más de los previstos**: `TotalCard` (las tres cifras, que
   ahora usan Inicio y Movimientos, y también cuentan en Movimientos) y
   `CurrencyPicker` (el selector de moneda de las dos pantallas). La moneda
   recordada pasa a `lib/currency.js`.
9. **El porcentaje va a la derecha de la barra** y no junto al monto: en
   bolívares, a 360 px, nombres como "Alimentación" se cortaban.
10. **El día elegido de entrada es el de más gasto**, así el detalle bajo las
    columnas nunca está vacío.
11. **"Gastaste el 74 % de lo que entró"** se calcula en el frontend con los
    totales ya convertidos; es solo un texto aproximado.
12. **El enlace de un gasto grande abre Movimientos en su mes**, sin filtrar ni
    resaltar ese gasto.
