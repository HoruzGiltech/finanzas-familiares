# Spec 016 — Conservar el monto original en CLP

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 004 (movimientos), 005 (tasas y conversiones), 013 (peso chileno) y 015 (moneda para ver) |

## 1. Objetivo

Que una familia que anota sus movimientos en pesos chilenos vea siempre el
mismo monto CLP que escribió, aunque cambie la tasa después de guardarlo.
La aplicación puede mostrar su equivalente en dólares y bolívares, pero esos
equivalentes no sustituyen ni modifican el monto original.

## 2. Reglas

1. Al anotar un movimiento en CLP, el importe original es el monto ingresado
   por la persona. Se conserva en CLP y no se vuelve a calcular con tasas
   posteriores.
2. Antes de guardar, el formulario muestra el equivalente aproximado en USD
   con la tasa disponible del dólar observado chileno y aclara la fecha de esa
   tasa cuando no sea la de hoy.
3. Al guardar, la conversión a USD se realiza con la tasa disponible en ese
   momento. Ese valor USD guardado no se recalcula por actualizaciones futuras
   de tasas.
4. Cuando la moneda para ver sea CLP, un movimiento anotado originalmente en
   CLP muestra exactamente su `original_amount`, no una conversión del USD
   guardado con la tasa actual.
5. Los equivalentes en monedas distintas de la moneda original son valores de
   conversión. La vista en bolívares y las demás monedas mantienen la regla
   existente de convertir desde USD con la tasa vigente; por tanto, pueden
   variar cuando cambie esa tasa.
6. Cuando la moneda para ver sea CLP, los totales y gráficos de movimientos se
   calculan sumando los montos CLP que se muestran para cada movimiento:
   - Si el movimiento se anotó en CLP, se suma su `original_amount`.
   - Si se anotó en otra moneda, se convierte su monto USD guardado a CLP con
     la tasa vigente.
   Así, las filas y sus totales coinciden; un cambio futuro de la tasa no
   altera la parte correspondiente a movimientos originalmente anotados en
   CLP.
7. La regla anterior se aplica a los totales de Movimientos, las cifras,
   categorías, días, métodos de pago y gastos principales del dashboard, y a
   los importes de la comparación mensual y su gráfico histórico. El PDF del
   dashboard refleja los mismos importes que Inicio. Los gastos principales
   se ordenan por el monto CLP que se muestra.
8. Cuando la moneda para ver sea CLP, los porcentajes del dashboard y de la
   comparación se calculan con los importes CLP definidos en la regla 6. Las
   comparaciones usan esos importes para cada periodo comparable. En las demás
   monedas se mantienen las reglas actuales.
9. El CSV conserva las columnas actuales e inserta `Monto CLP` justo después
    de `Monto USD`. Para cada movimiento, usa `original_amount` si se anotó en
    CLP; de lo contrario, convierte el monto USD guardado a CLP con la tasa
    vigente al exportar. Los gastos llevan signo negativo, como en `Monto USD`.
    Exportar no modifica los montos guardados.
10. Al corregir otros datos de un movimiento sin cambiar su monto ni moneda, se
   conserva el importe original y su conversión USD. Si la persona cambia el
   monto o la moneda, se guarda el nuevo importe original y se convierte con
   la tasa disponible al corregirlo.
11. La API sigue validando los montos CLP sin decimales y los límites ya
   establecidos.

## 3. Alcance

### 3.1 Backend

- Usar `Movement.original_amount` y `Movement.original_currency` como importe
  y moneda originales; no crear otra copia de esos datos.
- Al devolver movimientos para ver en CLP, devolver el importe original para
  los movimientos cuyo `original_currency` sea CLP.
- Mantener el monto base `Movement.amount` en USD y sin cambios al actualizarse
  tasas posteriores.
- Para una consulta en CLP, agregar los valores CLP de cada movimiento con la
  regla 6; mantener el comportamiento actual de agregación para las demás
  monedas.
- Aplicar la misma regla a los endpoints de resumen y comparación (specs 006 y
  007).
- Para consultas y exportaciones en CLP, calcular los porcentajes sobre los
  montos CLP resultantes. En las comparaciones, calcular diferencias y
  porcentajes con los importes CLP de cada periodo comparable.
- Agregar `Monto CLP` al CSV de movimientos, conservando las columnas actuales.
- No se necesita migración de datos.

### 3.2 Frontend

- Mantener el importe escrito en el campo al guardar y al consultar el
  movimiento en CLP.
- Mostrar el equivalente USD antes de guardar y dejar claro que es una
  conversión aproximada, no el monto original.
- Reutilizar los componentes, formato de monedas y avisos de tasa existentes.

## 4. Fuera de alcance

- Cambiar la moneda base de almacenamiento: el monto contable sigue en USD.
- Fijar para siempre equivalentes en bolívares, euros u otras monedas.
- Cambiar cómo se guardan o muestran los presupuestos; las partidas siguen la
  regla de la spec 010.
- Cambiar la fuente de la tasa CLP definida en la spec 013.
- Cambiar las columnas actuales del CSV distintas de agregar `Monto CLP`.

## 5. Criterios de aceptación

1. Con CLP como moneda para anotar, ingresar `50.000` muestra el equivalente
   aproximado en USD con la tasa disponible y permite guardar el movimiento.
2. El movimiento conserva `original_amount = 50000` y
   `original_currency = CLP`; el USD guardado corresponde a la conversión
   disponible al guardar.
3. Al ver ese movimiento en CLP, sigue mostrando `CLP$ 50.000` después de que
   cambie la tasa CLP/USD.
4. Una actualización de tasas no modifica `original_amount` ni `amount` en
   USD de movimientos ya guardados.
5. Si un mes solo tiene un movimiento anotado originalmente en CLP, sus
   totales y valores de gráficos en CLP coinciden exactamente con el importe
   original, incluso después de cambiar la tasa CLP/USD.
6. En un mes con un movimiento de CLP$ 50.000 anotado en CLP y otro de USD 20,
   y con una tasa de CLP$ 1.200 por USD, el total y los gráficos en CLP suman
   CLP$ 74.000 (50.000 + 24.000).
7. Los porcentajes del dashboard y de comparación en CLP se calculan con los
   importes CLP mostrados. En USD, VES o EUR se mantiene el comportamiento
   definido por las specs existentes.
8. El PDF refleja los mismos valores CLP que Inicio.
9. El CSV incluye `Monto CLP` para cada movimiento y conserva las columnas
    actuales. El monto CLP usa el valor original para anotaciones en CLP y, en
    los demás casos, el equivalente del monto USD guardado a la tasa vigente al
    exportar.
10. Al ver el equivalente de ese movimiento en bolívares, se aplica la tasa
   vigente según el comportamiento existente.
11. Corregir solo la descripción no cambia el monto original ni el monto USD.
   Cambiar el importe o la moneda sí actualiza ambos según la tasa disponible
   al corregirlo.
12. Las pruebas de tasas simulan las fuentes; ninguna prueba consulta internet.

## 6. Decisiones a revisar antes de aprobar

- La spec limita el monto inmutable a movimientos. Los presupuestos no guardan
  actualmente el importe y la moneda originales, y quedan fuera de alcance.
- En CLP, los importes de movimientos originalmente anotados en otras monedas
  siguen variando con la tasa vigente; solo los montos originalmente anotados
  en CLP permanecen fijos.
- El CSV agrega el equivalente CLP, pero conserva las columnas actuales de
  USD, monto original y tasa usada.
