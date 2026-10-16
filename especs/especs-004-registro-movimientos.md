# Spec 004 — Registro de ingresos y gastos

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 002 (roles) y spec 003 (categorías y métodos de pago) |
| **Desbloquea** | Spec 005 (montos en bolívares y euros), 006 (dashboard), 007 (comparación) y 008 (exportación) |

## 1. Objetivo

Que la familia pueda anotar cada ingreso y cada gasto, y consultar los de
cualquier mes con sus totales.

Al terminar esta spec un administrador o un editor registra un gasto desde el
móvil en pocos segundos, y cualquier miembro ve la lista del mes y cuánto entró,
cuánto salió y cuánto queda. Todavía no hay gráficos ni otras monedas.

## 2. Qué es un movimiento

Un movimiento es una entrada o una salida de dinero: "Mercado, 45,30 USD, pagado
con pago móvil el 12 de octubre". Si es ingreso o gasto lo decide su categoría,
porque cada categoría ya es de un tipo (spec 003).

## 3. Alcance

### 3.1 Modelo de datos

Nueva app de Django: `movements`.

**Movement**

| Campo | Tipo | Notas |
|---|---|---|
| `family` | relación a Family | |
| `category` | relación a Category | De ella sale el tipo (ingreso o gasto) |
| `payment_method` | relación a PaymentMethod | |
| `amount` | decimal (12 dígitos, 2 decimales) | En USD, siempre positivo |
| `date` | fecha | El día en que ocurrió, no el día en que se anotó |
| `description` | texto (200), opcional | "Mercado de la semana" |
| `created_by` | relación a User | Quién lo anotó |
| `created_at`, `updated_at` | fecha y hora | |

El monto se guarda siempre positivo; el signo lo pone el tipo de movimiento
(`sign` de la spec 003) al calcular los totales.

No se guarda el tipo en el movimiento: se lee de la categoría. Como el tipo de
una categoría no se puede cambiar (spec 003, regla 5), nunca quedan
desalineados.

### 3.2 Reglas

1. **Quién registra**: administradores y editores. Los lectores solo ven.
2. **Quién corrige o borra**: el administrador, cualquier movimiento de la
   familia. El editor, solo los que anotó él.
3. Cada familia ve únicamente sus movimientos. Uno de otra familia responde
   `404`.
4. El monto es mayor que cero, con dos decimales como máximo y hasta
   9.999.999,99.
5. La fecha no puede ser futura ni anterior al año 2000. "Hoy" se calcula con
   la hora de Venezuela.
6. La categoría y el método de pago deben ser de la familia y estar activos.
   Al corregir un movimiento antiguo se puede conservar una categoría o un
   método ya desactivados, pero no elegir uno desactivado nuevo.
7. Al corregir se puede cambiar todo, incluso pasar de gasto a ingreso
   eligiendo una categoría del otro tipo.
8. **Los movimientos sí se borran de verdad**, tras confirmar. Es la excepción
   a "nada se borra": un movimiento anotado por error no debe seguir en la base
   ni colarse en los totales.

### 3.3 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET movements/` | Cualquier miembro | Lista los movimientos de un mes, con sus totales |
| `POST movements/` | Administrador y editor | Crea un movimiento |
| `PATCH movements/{id}/` | Administrador; editor si es suyo | Corrige un movimiento |
| `DELETE movements/{id}/` | Administrador; editor si es suyo | Lo borra |

`GET movements/` acepta estos filtros:

| Parámetro | Ejemplo | Notas |
|---|---|---|
| `month` | `2026-10` | Si falta, el mes actual |
| `type` | `expense` | `income` o `expense` |
| `category` | `7` | Id de una categoría |

Devuelve todos los movimientos del mes, del más reciente al más antiguo, sin
paginar (una familia anota decenas al mes, no miles). Un filtro mal escrito
responde `400`.

```json
{
  "month": "2026-10",
  "totals": { "income": "1200.00", "expense": "845.30", "balance": "354.70" },
  "movements": [
    {
      "id": 31,
      "date": "2026-10-12",
      "amount": "45.30",
      "description": "Mercado de la semana",
      "movement_type": "expense",
      "category": { "id": 7, "name": "Alimentación" },
      "payment_method": { "id": 3, "name": "Pago móvil" },
      "created_by": { "id": 2, "full_name": "Luis Demo" },
      "can_edit": true
    }
  ]
}
```

- Los montos viajan como texto para no perder decimales.
- Los totales son los del mes completo, sin aplicar los filtros `type` ni
  `category`.
- `can_edit` le dice al frontend si debe mostrar los botones de corregir y
  borrar. La API vuelve a comprobarlo en cada `PATCH` y `DELETE`.

Para crear o corregir se envía `category`, `payment_method`, `amount`, `date` y
`description`.

### 3.4 Frontend

Pantalla nueva `/movimientos`, para todos los miembros, con su enlace
"Movimientos" en la navegación. En el móvil, cinco enlaces con su texto no caben
en la barra inferior a 360 px, así que "Contraseña" pasa a ser un icono en la
barra superior; en escritorio sigue en la navegación.

- **Selector de mes**: flechas para ir al mes anterior y al siguiente. No deja
  avanzar más allá del mes actual.
- **Totales del mes**: tres tarjetas, Ingresos, Gastos y Balance. Verde para
  ingresos y rojo para gastos, siempre con icono y signo, nunca solo el color.
- **Filtro**: Todos, Ingresos o Gastos.
- **Lista**: agrupada por día. Cada renglón muestra categoría, descripción,
  método de pago, quién lo anotó y el monto.
- **Sin movimientos**: mensaje con el botón para registrar el primero.
- **Agregar**: botón "Registrar movimiento", siempre visible en móvil. Abre un
  modal con el formulario:
  - Gasto o Ingreso (por defecto Gasto, que es lo que más se anota).
  - Monto, con teclado numérico en el móvil.
  - Categoría, solo las del tipo elegido.
  - Método de pago.
  - Fecha, por defecto hoy.
  - Descripción, opcional.
- **Corregir y borrar**: desde el renglón, solo si `can_edit`. Corregir abre el
  mismo formulario con los datos; borrar pide confirmación.
- Los lectores no ven los botones de agregar, corregir ni borrar.
- Los errores de la API aparecen junto a su campo.

En **Inicio** el texto provisional se cambia por un acceso directo a
Movimientos. El resumen con gráficos es de la spec 006.

Se reutilizan `Button`, `Field`, `Card`, `Modal`, `Alert` y `Skeleton`.

Animaciones, con los valores de `lib/motion.js`:

- Entrada escalonada de la lista y de las tarjetas de totales.
- Un movimiento nuevo aparece animado y uno borrado sale animado.
- Al cambiar de mes o de filtro, la lista hace una transición breve.
- Esqueleto mientras carga.
- Todo respeta "reducir movimiento".

### 3.5 Datos de ejemplo

`seed_demo` añade a "Familia Demo" unos 60 movimientos repartidos en los
últimos tres meses, si todavía no tiene ninguno. Así hay con qué probar esta
spec y las de dashboard y comparación sin cargar nada a mano.

Solo toca la familia de ejemplo. Los movimientos de cualquier otra familia no
se crean, modifican ni borran.

## 4. Fuera de alcance

- Registrar un monto en bolívares o euros y convertirlo (spec 005). En esta
  spec todo se anota en USD.
- Gráficos y resumen visual (spec 006).
- Comparación con meses anteriores (spec 007).
- Exportar a CSV o PDF (spec 008).
- Movimientos que se repiten solos cada mes (alquiler, salario).
- Adjuntar la foto del recibo.
- Transferencias entre cuentas y saldos por cuenta.
- Buscar por texto y filtrar por miembro o método de pago.
- Presupuestos.
- Historial de quién cambió qué.

## 5. Criterios de aceptación

**Registrar**

1. Un administrador y un editor crean un ingreso y un gasto; quedan guardados
   con su familia y con quien los anotó.
2. Un lector recibe `403` al crear, corregir o borrar.
3. Se rechaza con `400` y mensaje en español: monto cero, negativo, con más de
   dos decimales o por encima del máximo; fecha futura; categoría o método de
   pago inexistentes, desactivados o de otra familia.

**Consultar**

4. Cualquier miembro obtiene los movimientos del mes pedido, del más reciente
   al más antiguo, y sin `month` los del mes actual.
5. Los totales coinciden con la suma de ingresos, la suma de gastos y su
   diferencia, y no cambian al aplicar filtros.
6. Los filtros `type` y `category` devuelven solo lo que corresponde; un valor
   mal escrito responde `400`.
7. La respuesta nunca incluye movimientos de otra familia.

**Corregir y borrar**

8. El administrador corrige y borra cualquier movimiento de su familia.
9. Un editor corrige y borra los suyos; con los de otro miembro recibe `403`.
10. Un movimiento de otra familia responde `404` y no cambia.
11. Un movimiento antiguo conserva su categoría desactivada al corregir otro
    campo, pero no se le puede asignar una desactivada distinta.
12. Sin sesión, todas las rutas responden `401`.

**Frontend**

13. Un administrador o editor registra, corrige y borra desde la pantalla, y la
    lista y los totales se actualizan sin recargar.
14. Un lector ve la lista y los totales, sin botones de acción.
15. Al elegir Gasto o Ingreso, la lista de categorías cambia a las de ese tipo.
16. El selector de mes cambia la lista y los totales, y no pasa del mes actual.
17. Las animaciones de la sección 3.4 funcionan y se desactivan con "reducir
    movimiento".
18. La pantalla se usa bien a 360 px de ancho.

**Datos de ejemplo**

19. `seed_demo` deja a "Familia Demo" con movimientos en tres meses, no los
    duplica si se ejecuta dos veces y no toca ninguna otra familia.

**Pruebas**

20. Hay pruebas automáticas del backend para los criterios 1 a 12 y 19, y
    pasan.

## 6. Decisiones a revisar

1. **Todo en USD por ahora.** Si pagas en bolívares, en esta spec tendrías que
   anotar el equivalente en dólares. Anotar en bolívares o euros y que la
   aplicación convierta con la tasa del BCV llega con la spec 005, que necesita
   las tasas guardadas. Si prefieres no usar la aplicación hasta entonces,
   se pueden hacer las dos specs seguidas.
2. **El editor solo corrige y borra lo suyo**; el administrador, todo. La
   alternativa es que el editor pueda tocar cualquier movimiento de la familia.
3. **Los movimientos se borran de verdad**, a diferencia de categorías y
   usuarios. La alternativa es marcarlos como anulados y guardarlos.
4. **El método de pago es obligatorio también en los ingresos** (cómo se
   recibió el dinero). Es más simple que tener dos formularios distintos.
5. **No se permiten fechas futuras.** Un gasto que todavía no ocurrió no se
   anota.
6. **La lista no se pagina**: se pide un mes cada vez.
7. **"Contraseña" sale de la barra inferior del móvil** y queda como icono
   arriba, junto a "Cerrar sesión". Se decidió durante la implementación.
8. **`seed_demo` carga movimientos de ejemplo** en la familia de prueba.

## 7. Ajustes posteriores

1. **Fecha en dd/mm/aaaa** (15 de octubre de 2026, pedido por el usuario). El
   campo de fecha del navegador muestra el formato del idioma del navegador
   (en inglés, mm/dd/aaaa) y eso confunde en Venezuela. Ahora es un campo de
   texto `dd/mm/aaaa`:
   - Teclado numérico en el móvil; las barras se ponen solas y "1/" se
     convierte en "01/".
   - Botones **Hoy** y **Ayer** debajo del campo.
   - Botón de **calendario** junto al campo (en el móvil solo el icono), para
     cualquier otro día. Abre el calendario del navegador; el día elegido se
     escribe en el campo como dd/mm/aaaa.
   - Una fecha que no existe (31/02/2026) o futura se avisa junto al campo
     antes de enviar. La API sigue recibiendo y validando `2026-10-15`.
