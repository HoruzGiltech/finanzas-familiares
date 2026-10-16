# Spec 009 — Borrar categorías y métodos de pago sin movimientos

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 003 (catálogos) y spec 004 (movimientos) |
| **Cambia** | La regla 4 de la spec 003 ("Nada se borra: se desactiva") |

## 1. Objetivo

Que el administrador pueda **borrar de verdad** una categoría de ingreso o de
gasto, o un método de pago, que se creó por error o que nunca se usó, en vez de tener que dejarla
desactivada para siempre en Configuración.

Una categoría que **ya tiene movimientos** no se puede borrar: esos ingresos o
gastos se quedarían sin categoría y descuadrarían los totales y el dashboard.
Esa se sigue desactivando, como hasta ahora.

## 2. Reglas

1. Solo el administrador borra. Editores y lectores reciben `403`.
2. Solo se borra una categoría **sin ningún movimiento**, de ningún mes. Si
   tiene alguno, la API responde `400` con el mensaje: "Esta categoría tiene 12
   movimientos. Desactívala para que no se pueda elegir; así no se pierde
   nada."
3. No se puede borrar la **última categoría activa** de un tipo, por la misma
   razón que no se puede desactivar (regla 6 de la spec 003): siempre debe
   quedar algo que elegir.
4. Se puede borrar tanto una activa como una desactivada.
5. Una categoría de otra familia responde `404`.
6. Borrar no se puede deshacer, así que el frontend pide confirmación.
7. Si alguien anota un movimiento con esa categoría justo mientras se borra,
   gana el movimiento: la base de datos ya lo impide (`PROTECT`) y la API
   responde el mismo `400` de la regla 2.

Con esto la regla 4 de la spec 003 queda así: "Nada se borra: se desactiva.
La excepción son los movimientos (spec 004) y las categorías sin movimientos
(spec 009)".

## 3. Alcance

### 3.1 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `DELETE categories/{id}/` | Administrador | Borra la categoría si cumple las reglas. Responde `204` |

En la respuesta de `GET catalogs/?include_inactive=1` (la de Configuración,
solo para el administrador) cada categoría trae un campo nuevo:

```json
{ "id": 12, "name": "Mascotas", "movement_type": "expense", "is_active": true,
  "movement_count": 0 }
```

`movement_count` sirve para que el frontend muestre el botón de borrar solo
cuando se puede. La API lo vuelve a comprobar al borrar.

No hace falta migración: no cambia ningún modelo.

### 3.2 Frontend

En **Configuración**, en la lista de categorías:

- Las categorías con `movement_count` igual a 0 muestran un botón de borrar
  (icono de papelera, en rojo, con su nombre para el lector de pantalla:
  "Borrar Mascotas"), junto a "Desactivar".
- Al pulsarlo se abre una confirmación: "Vas a borrar la categoría
  **Mascotas**. No tiene movimientos. No se puede deshacer." con "Cancelar" y
  "Borrar".
- Al borrar, el renglón sale animado y la lista se reacomoda.
- Las que tienen movimientos no muestran el botón. Debajo de su nombre se ve
  "12 movimientos", para que se entienda por qué solo se pueden desactivar.
- Si la API responde con error (regla 2, 3 o 7), el mensaje aparece en la
  confirmación.
- Botón y confirmación de 44 px de alto como mínimo, y se usan bien en el
  móvil a 360 px.

Se reutilizan `IconButton`, `Modal`, `Button` y `Alert`, y las animaciones de
`lib/motion.js`.

## 4. Fuera de alcance

- Mover los movimientos de una categoría a otra para poder borrarla
  ("fusionar categorías").
- Papelera o deshacer el borrado.

## 5. Criterios de aceptación

1. El administrador borra una categoría sin movimientos (activa o
   desactivada) y deja de aparecer en todos los catálogos.
2. Una categoría con al menos un movimiento no se borra: `400` con el mensaje
   de la regla 2, y la categoría sigue igual.
3. La última categoría activa de un tipo no se borra: `400`.
4. Editor y lector reciben `403`; sin sesión, `401`; una categoría de otra
   familia, `404`.
5. `GET catalogs/?include_inactive=1` trae `movement_count` correcto en cada
   categoría.
6. En Configuración el botón de borrar solo sale en las categorías sin
   movimientos, pide confirmación y el renglón desaparece al borrar.
7. Funciona bien en el móvil a 360 px.
8. Hay pruebas automáticas del backend para los criterios 1 a 5, y pasan.

## 6. Decisiones a revisar

1. **También los métodos de pago.** Al aprobar, el usuario pidió que todo
   quedara homologado: los métodos de pago siguen las mismas reglas (sin
   movimientos, no el último activo) con `DELETE payment-methods/{id}/`, y el
   mismo botón en Configuración. El mensaje dice "Este método de pago tiene…
   Desactívalo…".
2. **Con movimientos no se borra nunca**, ni aunque se confirme dos veces. La
   alternativa (borrar también sus movimientos) haría perder datos sin querer.
3. **`movement_count` solo en la respuesta de Configuración**, no en la que
   usan los formularios, para no hacer más lentas las demás pantallas.
4. **Número 009**: las specs 007 (comparación) y 008 (exportación) ya están
   reservadas en la hoja de ruta.

Decididas durante la implementación:

5. **En el móvil los botones de cada renglón van debajo del nombre**, juntos
   y a la derecha. Con el botón de borrar no cabían al lado y nombres como
   "Entretenimiento" se partían.
6. **También al renombrar o activar** la respuesta trae `movement_count`, para
   que el botón de borrar no aparezca ni desaparezca por error.
7. Se actualizó el texto de "Monedas" en Configuración, que aún decía que las
   tasas del BCV llegarían "en un próximo paso" (llegaron en la spec 005).
