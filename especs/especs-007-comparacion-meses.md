# Spec 007 — Comparación contra meses anteriores

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 006 (dashboard) |
| **Desbloquea** | Spec 008 (el PDF del dashboard incluirá la comparación) |

## 1. Objetivo

Que la familia sepa si este mes va **mejor o peor que los anteriores** y,
sobre todo, **en qué categorías está gastando más de lo normal**: ahí están
las fugas de dinero.

Al terminar esta spec el dashboard de Inicio dice, por ejemplo: "Gastos
$732,88 ▲ 12 % más que en septiembre", muestra cómo fueron los gastos de los
últimos 6 meses y señala las categorías que subieron y las que bajaron.

## 2. Con qué se compara

### 2.1 El periodo comparable

Comparar un mes **a medias** con un mes **completo** engaña: el 15 de octubre
siempre parecerá que se gastó menos que en todo septiembre.

- **Mes ya cerrado** (por ejemplo, septiembre visto en octubre): se compara
  con el mes completo anterior.
- **Mes en curso**: se compara **hasta el mismo día**. El 15 de octubre se
  compara con lo gastado del 1 al 15 de septiembre. Si el mes anterior es más
  corto (31 de marzo frente a febrero), se usa el mes anterior completo.

La pantalla siempre dice contra qué compara: "vs. septiembre" o "vs. 1–15 de
septiembre".

### 2.2 Las dos comparaciones

| Qué | Contra qué | Por qué |
|---|---|---|
| Ingresos, gastos y balance | El **mes anterior** (periodo comparable) | Es la pregunta natural: "¿cómo vamos frente al mes pasado?" |
| Cada categoría de gasto | El **promedio de los 3 meses anteriores** (cada uno en su periodo comparable) | Un solo mes puede ser raro (una reparación, el colegio); el promedio dice qué es "lo normal" |

Si no hay meses anteriores con movimientos, no se compara y se dice
"Todavía no hay meses anteriores para comparar".

### 2.3 Monedas

Igual que todo lo demás (spec 005): se suma en USD y se convierte con la tasa
de hoy. Los porcentajes se calculan en USD, así no cambian con la moneda.

## 3. Alcance

### 3.1 API

Nueva ruta en la app `movements`:

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET movements/comparison/` | Cualquier miembro | Comparación del mes con los anteriores |

Parámetros: `month` y `currency`, con la misma validación que el resumen
(spec 006). Sin tasa, otra moneda responde `400`.

```json
{
  "month": "2026-10",
  "currency": "USD",
  "rate": { "...": "igual que en el resumen" },
  "partial_until": 15,
  "previous": {
    "month": "2026-09",
    "totals": { "income": "1100.00", "expense": "654.20", "balance": "445.80" },
    "change": { "income": "-10.1", "expense": "12.0", "balance": "-42.6" }
  },
  "history": [
    { "month": "2026-05", "income": "0.00", "expense": "0.00", "in_progress": false },
    { "month": "2026-10", "income": "989.11", "expense": "732.88", "in_progress": true }
  ],
  "categories": [
    { "id": 7, "name": "Alimentación", "amount": "171.75", "average": "120.40",
      "change": "51.35", "change_percent": "42.6" }
  ]
}
```

- `partial_until`: el día hasta el que se compara (mes en curso), o `null`
  si el mes está cerrado.
- `previous`: totales del mes anterior en su periodo comparable, y el cambio
  en porcentaje con un decimal. `null` si el mes anterior no tiene
  movimientos; un cambio es `null` si su base es cero (no se puede calcular
  un porcentaje sobre cero).
- `history`: los **6 meses** que terminan en el mes elegido, del más antiguo
  al más reciente, con sus totales **completos** (no el periodo comparable:
  es para ver la tendencia). El mes en curso lleva `in_progress: true`.
- `categories`: solo gastos. Cada categoría que tenga gasto este mes o en el
  promedio, con su monto de este mes (periodo comparable), el promedio de los
  3 meses anteriores, la diferencia y el porcentaje (`null` si el promedio es
  cero: es "nueva"). Ordenadas de la que más subió a la que más bajó. Vacía
  si no hay meses anteriores con movimientos.

### 3.2 Frontend

Todo va en **Inicio**, dentro del dashboard de la spec 006. No hay pantalla
nueva: así se ve nada más entrar y la barra del móvil no crece.

**Cifras del mes** (las tres que ya hay): debajo de cada una, una línea con
el cambio frente al mes anterior: "▲ 12 % vs. septiembre". Siempre con
flecha y signo, nunca solo el color:

- Gastos: subir es malo (rojo, ▲); bajar es bueno (verde, ▼).
- Ingresos y balance: subir es bueno (verde, ▲); bajar es malo (rojo, ▼).
- Sin cambio: "= igual que septiembre", en gris.
- Sin base: "Sin datos de septiembre".

**Bloque "Qué cambió"** (justo después de "Gastos por categoría", porque
responde a la misma pregunta):

- Subtítulo: "Frente al promedio de julio a septiembre" (o "…hasta el día
  15" en el mes en curso).
- **Subieron**: las 5 categorías que más subieron. Cada fila: nombre, monto
  de este mes, y "▲ +$51,35 (+43 %)" (o "nueva" si antes no había gasto).
- **Bajaron**: las 3 que más bajaron, con ▼.
- Tocar una categoría abre Movimientos filtrado por ella (como en la spec 006).
- Si ninguna cambió o no hay meses anteriores, un mensaje en su lugar.

**Bloque "Últimos 6 meses"**:

- Una columna de gastos por mes, en azul. El mes elegido en azul fuerte y los
  demás más claros (para resaltarlo). El mes en curso lleva una marca "en
  curso".
- Debajo de cada columna, el mes abreviado ("may", "jun"…).
- Tocar una columna (o pasar el cursor) muestra el detalle fijo debajo:
  "Septiembre: gastaste $654,20 de $1.100,00 que entraron (balance
  +$445,80)". Por defecto, el mes elegido.
- "Ver como tabla" con mes, ingresos, gastos y balance.
- Se reutiliza el gráfico de columnas de la spec 006 (`DailyChart`),
  generalizado para servir con días y con meses.

**En el móvil** (de 360 a 430 px): las líneas de cambio caben bajo cada cifra
sin cortarse; las filas de "Qué cambió" ponen nombre y monto en la primera
línea y el cambio en la segunda; las 6 columnas usan todo el ancho; zonas
táctiles de 44 px.

Animaciones con `lib/motion.js`: los bloques entran con los demás, las
columnas crecen desde abajo y todo respeta "reducir movimiento".

## 4. Fuera de alcance

- Elegir con qué mes comparar o cuántos meses promediar.
- Comparar ingresos por categoría.
- Comparar métodos de pago.
- Alertas o avisos automáticos ("este mes gastaste más en…").
- Presupuestos.
- Exportar la comparación (spec 008).

## 5. Criterios de aceptación

**API**

1. Cualquier miembro obtiene la comparación del mes pedido.
2. Mes cerrado: `previous` trae los totales del mes anterior completo y los
   porcentajes son correctos.
3. Mes en curso: `partial_until` es el día de hoy y `previous` solo suma
   hasta ese día del mes anterior.
4. Con base cero, el porcentaje es `null`; sin movimientos el mes anterior,
   `previous` es `null`.
5. `history` trae 6 meses en orden, con ceros en los meses sin movimientos y
   `in_progress` solo en el mes en curso.
6. `categories` compara con el promedio de los 3 meses anteriores, ordena de
   la que más subió a la que más bajó, marca como nueva (porcentaje `null`) la
   que antes no tenía gasto y no incluye ingresos.
7. Los montos van en la moneda pedida y los porcentajes no cambian con ella.
8. Nunca aparecen datos de otra familia; sin sesión `401`; parámetros mal
   escritos `400`.

**Frontend**

9. Cada cifra del mes muestra su cambio con flecha, signo y texto, con el
   color correcto según sea ingreso o gasto.
10. "Qué cambió" muestra subidas y bajadas, y tocar una abre Movimientos
    filtrado.
11. "Últimos 6 meses" muestra las columnas, el detalle al tocar y la tabla.
12. Sin meses anteriores, se ve el mensaje en lugar de los cambios.
13. Funciona bien en el móvil (360 a 430 px), sin desplazamiento horizontal.
14. Las animaciones funcionan y se desactivan con "reducir movimiento".

**Pruebas**

15. Hay pruebas automáticas del backend para los criterios 1 a 8, y pasan.

## 6. Decisiones a revisar

1. **Mes en curso comparado hasta el mismo día**, no contra el mes anterior
   completo. Es más justo, pero hay que leer "vs. 1–15 de septiembre".
2. **Categorías contra el promedio de 3 meses** y no contra el mes anterior
   solo, para que un gasto raro de un mes no parezca una fuga.
3. **Todo en Inicio**, sin pantalla nueva.
4. **El gráfico de 6 meses muestra solo los gastos** (los ingresos y el
   balance salen al tocar y en la tabla). Dos series de colores verde y rojo
   no las distingue bien una persona con daltonismo, y la pregunta del
   gráfico es "¿estoy gastando más?".
5. **Siguen sin librería de gráficos**: todo son columnas, que ya se dibujan
   con HTML. Recharts sigue sin hacer falta.
6. **6 meses de historia y 3 de promedio**, fijos. Son parámetros de cálculo,
   no listas que el usuario elija.

Decididas durante la implementación:

7. **El promedio usa solo los meses que tienen movimientos** (de los 3
   anteriores). Una familia que empezó hace dos meses no tiene un tercer mes
   en cero que haga parecer que todo subió.
8. **`history` trae también el balance** de cada mes, para el detalle y la
   tabla.
9. **El subtítulo de "Qué cambió" dice "promedio de los meses anteriores
   (hasta 3)"** en vez de nombrar los meses, para no añadir otro campo a la
   API.
10. **El gráfico de columnas es un componente común (`ColumnChart`)**; "Gastos
    por día" y "Últimos 6 meses" solo le dan sus columnas y su tabla.
11. **Orden en escritorio**: categorías junto a "Qué cambió", los dos gráficos
    de columnas a todo el ancho, y métodos de pago junto a los gastos más
    grandes. En el móvil, el mismo orden uno debajo de otro.
12. **En la Familia Demo, octubre sale "Ninguna categoría cambió"**: sus datos
    de ejemplo multiplican la misma plantilla por 1,12 (agosto), 0,88
    (septiembre) y 1 (octubre), y el promedio de agosto y septiembre es
    exactamente octubre. Septiembre sí muestra cambios.
