# Spec 010 — Presupuesto mensual

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 004 (movimientos), 005 (monedas y tasas) y 007 (comparación) |
| **Nota** | Se escribe antes que la 008 (exportación), que sigue pendiente |

## 1. Objetivo

Que la familia **planifique** cada mes lo que piensa gastar ("Alquiler $350,
Mercado $200, Luz $2,30…"), vea cuánto lleva cumplido y, cuando un gasto
se hace, lo marque como **realizado** para que pase solo a Movimientos sin
volver a escribirlo.

Al empezar cada mes, la aplicación **propone el presupuesto nuevo** a partir
del mes anterior, con lo que realmente se gastó, para que solo haya que
revisarlo.

## 2. Conceptos

- **Presupuesto del mes**: la lista de partidas de un mes de la familia. No
  es un objeto aparte: es el conjunto de partidas de ese mes.
- **Partida**: un gasto previsto. Tiene descripción ("Alquiler"), categoría de
  gasto y monto aproximado **en USD**.
- **Pendiente** o **realizada**: una partida está realizada cuando tiene un
  movimiento enlazado (el que se creó al marcarla). Si ese movimiento se
  borra desde Movimientos, la partida vuelve a pendiente.

## 3. Reglas

1. **Quién**: administradores y editores crean, corrigen, quitan y marcan
   partidas (el mismo permiso que registrar movimientos). Los lectores solo
   ven el presupuesto.
2. A diferencia de los movimientos, **cualquier editor puede tocar cualquier
   partida** de su familia: el presupuesto es un plan común, no algo de quien
   lo escribió.
3. Solo **gastos**: la categoría de una partida debe ser de gasto, de la
   familia y activa (o la que ya tenía, si se desactivó después).
4. **El monto se guarda en USD**, como todo en la aplicación. Se puede
   escribir en $, € o Bs.: en ese caso se convierte a USD con la tasa de hoy
   al guardar, y solo queda el USD. Para verlo en bolívares o euros, la
   pantalla tiene el selector de moneda, que convierte con la **tasa de hoy**
   (spec 005).
5. El monto es mayor que cero y como mucho 9.999.999,99, como en movimientos.
6. Se puede presupuestar el mes actual, cualquier mes pasado y **el mes
   siguiente** (para planificar con tiempo). No más allá.
7. **Marcar como realizado** crea un movimiento con la categoría y la
   descripción de la partida, y pregunta:
   - **Método de pago** (obligatorio).
   - **Monto real**, que empieza con el previsto y se puede cambiar; también
     su moneda.
   - **Fecha**, que empieza en hoy (o en el último día del mes si el
     presupuesto es de un mes pasado), en formato dd/mm/aaaa.
   El movimiento se guarda en USD como cualquier otro (spec 005) y su autor es
   quien lo marcó.
8. **Deshacer** una partida realizada borra su movimiento, tras confirmar, y
   la deja pendiente. Solo puede hacerlo quien puede borrar ese movimiento (el
   administrador, o el editor que lo marcó; spec 004).
9. **Quitar** una partida realizada no borra su movimiento: el gasto se hizo
   igual. Solo deja de estar en el presupuesto.
10. Cada familia ve y toca solo lo suyo; lo de otra familia responde `404`.

## 4. La propuesta de cada mes

Al abrir **Presupuesto** en un mes que todavía **no tiene partidas** y cuyo
mes anterior **sí tiene**, se ofrece: "Preparar el presupuesto de noviembre a
partir de octubre". Al aceptarlo se ve la propuesta, que se puede revisar
antes de crearla:

- **Cada partida del mes anterior**, con su monto propuesto:
  - si se realizó, **lo que realmente se gastó** (el monto en USD de su
    movimiento);
  - si quedó pendiente, el monto previsto.
  Junto a cada una se ve el previsto y el real del mes anterior, para
  comparar. Cada partida tiene una casilla (marcada por defecto) y su monto se
  puede cambiar.
- **Gastos sin presupuestar**: las categorías en las que el mes anterior hubo
  gastos que no venían de ninguna partida ("Entretenimiento $43,15"),
  desmarcadas por defecto, para añadirlas si se quiere.
- Botón **"Crear presupuesto"**: crea las partidas marcadas, todas pendientes.

No hay tareas programadas: la propuesta aparece **cuando alguien entra** en
el mes nuevo. En **Inicio**, a administradores y editores se les recuerda con
un aviso: "Ya es noviembre: prepara el presupuesto del mes" (con enlace),
mientras el mes actual no tenga partidas y el anterior sí.

## 5. Alcance

### 5.1 Modelo de datos

Nueva app de Django: `budget`.

**BudgetItem**

| Campo | Tipo | Notas |
|---|---|---|
| `family` | relación a Family | |
| `month` | fecha | Primer día del mes ("2026-11-01") |
| `category` | relación a Category | De gasto. `PROTECT`, como en movimientos |
| `description` | texto (200) | "Alquiler" |
| `amount` | decimal (12, 2) | En USD, siempre positivo |
| `movement` | relación a Movement, opcional | El movimiento creado al realizarla. `SET_NULL`: si se borra, vuelve a pendiente |
| `created_by` | relación a User | |
| `created_at`, `updated_at` | fecha y hora | |

Un movimiento solo puede estar enlazado a una partida (`OneToOne`).

### 5.2 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET budget/?month=&currency=` | Cualquier miembro | Partidas del mes y sus totales |
| `POST budget/items/` | Admin y editor | Crea una partida |
| `PATCH budget/items/{id}/` | Admin y editor | Corrige descripción, categoría o monto |
| `DELETE budget/items/{id}/` | Admin y editor | Quita la partida (el movimiento, si hay, se queda) |
| `POST budget/items/{id}/realize/` | Admin y editor | Crea el movimiento y la marca realizada |
| `POST budget/items/{id}/undo/` | Quien pueda borrar el movimiento | Borra el movimiento y la deja pendiente |
| `GET budget/proposal/?month=` | Admin y editor | La propuesta a partir del mes anterior |
| `POST budget/proposal/` | Admin y editor | Crea las partidas elegidas de la propuesta |

`GET budget/` devuelve:

```json
{
  "month": "2026-11",
  "currency": "USD",
  "rate": { "...": "igual que en el resumen" },
  "totals": { "planned": "1250.00", "done": "640.00", "pending": "590.00",
              "unplanned": "85.30" },
  "can_propose": false,
  "items": [
    { "id": 4, "description": "Alquiler", "category": { "id": 2, "name": "Vivienda" },
      "amount": "350.00",
      "movement": { "id": 81, "date": "2026-11-02", "amount": "350.00",
                    "original_amount": "350.00", "original_currency": "USD",
                    "payment_method": "Transferencia", "can_undo": true } }
  ]
}
```

- `planned`: suma de las partidas. `done`: suma de lo **realmente gastado** en
  las realizadas (sus movimientos). `pending`: suma de las pendientes.
  `unplanned`: gastos del mes que no vienen de ninguna partida. Todo en la
  moneda pedida, con la tasa de hoy.
- `amount`: el monto previsto en la moneda que se ve (guardado en USD,
  convertido con la tasa de hoy).
- Para crear o corregir una partida se envía `amount` y, si se escribió en
  otra moneda, `currency`: el backend lo pasa a USD y guarda solo eso.
- `can_propose`: el mes no tiene partidas y el anterior sí.

`POST budget/items/{id}/realize/` recibe `payment_method`, `amount`,
`currency` y `date`, y los valida como un movimiento nuevo (spec 004 y 005).

### 5.3 Frontend

Pantalla nueva **Presupuesto** (`/presupuesto`), para todos los miembros, con
su enlace en la navegación.

- **Arriba**: selector de mes (deja ir hasta el mes siguiente) y de moneda
  ($ · € · Bs.), con la tasa y sus avisos, como en Inicio.
- **Cifras**: Presupuestado, Realizado y Pendiente, y debajo "Gastos fuera
  del presupuesto: $85,30" si los hay. Una barra muestra cuánto del
  presupuesto ya se realizó.
- **Partidas**: agrupadas por categoría. Cada una con descripción, monto
  previsto y su estado:
  - **Pendiente**: botón "Realizado".
  - **Realizada**: marca ✓ con el monto real, la fecha y el método de pago; si
    el real supera al previsto, se dice ("$20,00 más de lo previsto"), con
    icono y texto, no solo color. Botón "Deshacer" si `can_undo`.
  - Corregir (lápiz) y quitar (papelera, con confirmación).
- **Agregar partida**: botón que abre un formulario: descripción, categoría
  de gasto y monto, en $ por defecto (se puede escribir en € o Bs. y se ve
  "≈ $X con la tasa de hoy", como en movimientos).
- **Marcar como realizado**: abre un formulario con método de pago, monto real
  (con su moneda) y fecha (dd/mm/aaaa, con Hoy, Ayer y calendario, como en
  movimientos).
- **Mes sin partidas**: si `can_propose`, la tarjeta "Preparar el presupuesto
  de noviembre a partir de octubre"; si no, "Agrega la primera partida".
- **Propuesta**: pantalla en un modal con las dos listas de la sección 4,
  casillas y montos editables, y "Crear presupuesto".
- Los lectores no ven botones de acción.
- **En el móvil** (360 a 430 px): cifras en filas, cada partida en dos líneas
  (descripción y monto arriba; estado y acciones abajo), botones de 44 px y
  sin desplazamiento horizontal.

**Navegación en el móvil**: con Presupuesto, el administrador tendría cinco
enlaces en la barra inferior, que no caben con texto a 360 px (spec 004). En
el móvil, **Miembros pasa a estar dentro de Configuración** (un enlace al
principio de esa pantalla); en escritorio todo sigue igual.

Se reutilizan `MonthPicker`, `CurrencyPicker`, `RateInfo`, `TotalCard`,
`Modal`, `Field`, `Button`, `IconButton` y `Alert`, y el campo de fecha de
movimientos.

Animaciones con `lib/motion.js`: entrada escalonada, una partida nueva entra
animada y una quitada sale; al marcarla realizada cambia de estado con una
transición breve; la barra de avance crece con `transform`.

## 6. Fuera de alcance

- Ingresos previstos (solo gastos).
- Partidas que se repiten solas sin pasar por la propuesta.
- Avisos o notificaciones cuando se pasa del presupuesto.
- Presupuesto por categoría con tope ("no más de $300 en mercado"): aquí cada
  partida es un gasto concreto.
- Realizar una partida en varios pagos (una partida = un movimiento).
- Exportar el presupuesto (podría entrar en la spec 008).

## 7. Criterios de aceptación

**API**

1. Administrador y editor crean, corrigen y quitan partidas; el lector recibe
   `403`; sin sesión, `401`; lo de otra familia, `404`.
2. Se rechaza con `400`: categoría de ingreso, de otra familia o desactivada;
   monto inválido; mes más allá del siguiente.
3. Realizar crea un movimiento con la categoría, descripción, método de pago,
   monto, moneda y fecha indicados, enlazado a la partida, con autor quien lo
   marcó. Una partida ya realizada no se puede realizar otra vez (`400`).
4. Deshacer borra el movimiento y deja la partida pendiente; un editor que no
   lo marcó recibe `403`.
5. Borrar el movimiento desde Movimientos deja la partida pendiente.
6. Quitar una partida realizada no borra su movimiento.
7. Los totales `planned`, `done`, `pending` y `unplanned` son correctos y van
   en la moneda pedida.
8. La propuesta usa el monto real de las partidas realizadas y el previsto de
   las pendientes, e incluye las categorías con gastos sin presupuestar; crear
   desde la propuesta genera solo las partidas elegidas.
9. `can_propose` es verdadero solo si el mes no tiene partidas y el anterior sí.

**Frontend**

10. Un editor arma el presupuesto del mes, lo corrige y quita partidas.
11. Marcar como realizado pide el método de pago, crea el movimiento (visible
    en Movimientos y en el dashboard) y la partida queda con su ✓.
12. Al entrar en un mes nuevo se ofrece la propuesta, se revisa y se crea.
13. Inicio avisa del presupuesto pendiente de preparar.
14. El lector ve el presupuesto sin botones.
15. Funciona bien en el móvil (360 a 430 px), y Miembros sigue accesible
    desde Configuración.
16. Animaciones con "reducir movimiento" respetado.

**Pruebas**

17. Hay pruebas automáticas del backend para los criterios 1 a 9, y pasan.

## 8. Decisiones a revisar

1. **Mismo permiso que movimientos** (administrador y editor). No se crea un
   rol nuevo "puede presupuestar".
2. **Cualquier editor toca cualquier partida**, a diferencia de los
   movimientos, porque el presupuesto es un plan de toda la familia.
3. **Solo gastos**, no ingresos previstos.
4. **Las partidas se guardan en USD** (pedido por el usuario). Si se
   escriben en Bs. o €, se convierten a USD al guardarlas. En pantalla se
   pueden ver en Bs. o € con la tasa de hoy, así que una partida de $2,30 se
   verá en más bolívares cuando suba el dólar.
5. **La propuesta usa lo realmente gastado** en cada partida realizada, como
   pediste ("actualizar con los montos del mes anterior"), y deja elegir.
6. **La propuesta aparece al entrar**, sin tareas programadas, igual que la
   tasa del BCV (spec 005).
7. **Deshacer borra el movimiento**; quitar la partida no.
8. **Se puede planificar el mes siguiente**, pero no más adelante.
9. **En el móvil, Miembros pasa a Configuración** para que quepa Presupuesto
   en la barra inferior.
10. **Número 010**: la 008 (exportación) sigue reservada y pendiente.

Decididas durante la implementación:

11. **La propuesta va en USD**, como se guarda el presupuesto; el selector de
    moneda no la cambia.
12. **Una categoría que usa el presupuesto no se puede borrar** (spec 009):
    responde "Esta categoría se usa en el presupuesto…". Se puede desactivar.
13. **Al marcar como realizado, el monto real empieza en la moneda que se está
    viendo** (si se ve en Bs., empieza en bolívares).
14. **Al corregir una partida, el monto solo se envía si se cambió**, para que
    ver en Bs. y guardar no mueva el USD por redondeo.
15. **El campo de fecha y el de monto con moneda pasaron a ser componentes**
    (`DateField` y `AmountField`), compartidos por Movimientos y Presupuesto.
16. **En el móvil, una partida realizada pone su detalle en una línea y los
    botones debajo**; una pendiente, "Pendiente" y los botones juntos si caben.
17. Si la categoría de una partida se desactivó, al marcarla realizada el
    movimiento no se puede crear con ella (regla de movimientos): hay que
    corregir la partida y elegir otra categoría.
