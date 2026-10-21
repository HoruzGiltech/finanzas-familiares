# Spec 017 — Conservar el monto original del presupuesto

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 010 (presupuesto), 011 (lista del supermercado), 013 (moneda para anotar), 015 (moneda para ver) y 016 (montos originales en CLP) |

## 1. Objetivo

Que una partida de presupuesto conserve el monto y la moneda que escribió la
persona. Si se anotó en CLP, al volver a ver el presupuesto en CLP debe aparecer
el mismo importe, sin el cambio que produce convertirlo a USD y luego de vuelta
a CLP con redondeo.

Los montos USD siguen siendo la base para cálculos y se guardan como ahora. El
monto original es la referencia para mostrar la partida cuando la familia la
consulta en esa misma moneda.

## 2. Reglas

1. Al crear o cambiar el monto de una partida sin lista, guardar:
   - `amount`: equivalente en USD, calculado con la tasa disponible al guardar.
   - `original_amount`: el monto que ingresó la persona.
   - `original_currency`: la moneda que seleccionó.
2. Si la moneda para ver coincide con `original_currency`, mostrar
   `original_amount` sin convertirlo. Si es otra moneda, mostrar `amount`
   convertido con la tasa vigente, como hoy.
3. Cambiar la descripción o categoría sin cambiar el monto ni la moneda no
   vuelve a convertir ni altera ninguno de los importes.
4. Una partida con lista del supermercado obtiene su `amount` del total de los
   productos, que se guardan en USD (spec 011). En ese caso, el monto original
   es ese total en USD y `original_currency` es USD; modificar la lista
   actualiza el monto de la partida y estos campos.
5. Las partidas preparadas desde la propuesta mensual usan como monto original
   y moneda el valor propuesto en USD. La persona puede cambiar el monto y la
   moneda al revisar cada partida antes de crearla.
6. Al marcar una partida como realizada, el monto real se guarda como
   movimiento con la validación y conversión de movimientos. Los importes
   originales de la partida prevista no se reemplazan por los del movimiento.
7. Cuando la moneda para ver sea CLP, los totales **presupuestado**, **realizado**
   y **pendiente** suman los mismos montos CLP que muestran sus partidas:
   - Partida sin lista anotada originalmente en CLP: `original_amount`.
   - Partida anotada en otra moneda, con lista o cuyo original es USD:
     `amount` convertido a CLP con la tasa vigente.
   - Realizado: se suma el monto del movimiento enlazado, usando el original
     del movimiento si se anotó en CLP y, en otro caso, su monto USD convertido
     a CLP (spec 016).
8. Los gastos fuera del presupuesto del resumen se calculan con la misma regla
   de movimientos CLP de la spec 016.
9. En otras monedas, los totales y montos siguen convirtiéndose desde USD con
   las tasas vigentes. Los valores en USD guardados no se recalculan cuando
   cambian las tasas.
10. Los límites y validaciones de monto y moneda son los mismos que al crear
    movimientos. Ninguna conversión usa `float`.

## 3. Alcance

### 3.1 Datos y backend

- Añadir `BudgetItem.original_amount` (Decimal) y
  `BudgetItem.original_currency` (FK a `Currency`).
- La migración inicializa las partidas existentes como `original_amount =
  amount` y moneda USD. No cambia sus valores guardados y no intenta inferir
  el monto original CLP, porque ese dato no existe actualmente.
- Crear, editar y obtener partidas devuelve y conserva los importes originales
  con las reglas de la sección 2.
- Actualizar listas del supermercado mantiene su monto derivado en USD.
- Agregar las partidas desde una propuesta guarda el monto propuesto como USD
  original.
- Los totales de presupuesto en CLP se agregan por partida mostrada y los
  movimientos enlazados o no presupuestados siguen las reglas de la spec 016.

### 3.2 Frontend

- Los formularios de partida nueva, edición y propuesta permiten anotar en la
  moneda familiar inicial y mostrar el equivalente USD aproximado con la tasa
  disponible.
- Al editar una partida, se muestra el valor original si la moneda elegida para
  ver coincide con la moneda original.
- La lista, el detalle y los totales de presupuesto muestran el monto sin
  alterarlo al guardar y volver a cargar en la misma moneda.
- Las listas del supermercado mantienen sus precios y totales en USD.

## 4. Fuera de alcance

- Cambiar la moneda base de almacenamiento (sigue siendo USD).
- Recuperar importes originales en CLP de partidas que ya existían antes de la
  migración.
- Cambiar la forma de guardar los productos de una lista del supermercado.
- Cambiar el CSV de movimientos o crear una exportación de presupuestos.

## 5. Criterios de aceptación

1. Con CLP como moneda para anotar, una partida nueva de CLP$ 5.990 guarda
   `original_amount = 5990`, `original_currency = CLP` y su equivalente USD.
2. Después de guardar y volver a consultar en CLP, la partida muestra
   exactamente CLP$ 5.990, aunque el USD equivalente redondeado no permita una
   conversión de vuelta idéntica.
3. Lo mismo ocurre con CLP$ 13.990 y con otros importes válidos, sin ajustes ni
   redondeos visibles del valor original.
4. Editar solo la descripción o categoría no modifica `amount`,
   `original_amount` ni `original_currency`.
5. Cambiar el monto o moneda reemplaza el original y calcula el nuevo USD con
   la tasa disponible al guardar.
6. En CLP, los totales de presupuestado, realizado, pendiente y gastos fuera
   del presupuesto suman los importes que se muestran en sus filas.
7. Una actualización de tasas no modifica los campos guardados. Los importes
   originales en CLP permanecen iguales y los equivalentes en otras monedas
   usan la tasa vigente.
8. Al modificar una lista del supermercado, el total de su partida sigue
   saliendo de la suma de productos en USD.
9. Las partidas existentes conservan su `amount` y quedan con moneda original
   USD después de la migración.
10. Las pruebas de tasas simulan sus fuentes; ninguna prueba consulta internet.

## 6. Decisiones aprobadas

- La migración no puede recuperar la cantidad CLP escrita anteriormente; las
  partidas existentes se tratarán como USD.
- Las partidas con lista siguen teniendo USD como importe original porque sus
  precios se ingresan en USD.
