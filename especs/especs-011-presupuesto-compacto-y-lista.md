# Spec 011 — Presupuesto compacto y lista del supermercado

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 010 (presupuesto mensual) |

## 1. Objetivo

1. Que la pantalla **Presupuesto** sea **más compacta**: ver de un vistazo
   todas las partidas del mes, sobre todo en el móvil.
2. Que una partida pueda llevar una **lista del supermercado**: productos con
   su cantidad y su precio en USD. Lo que suma la lista es el monto previsto de
   la partida. Al comprar, se marca como realizada con el monto real y pasa a
   Movimientos, como cualquier partida.

## 2. Presupuesto más compacto

### 2.1 Cómo se ve hoy

- Tres tarjetas de cifras (en el móvil, una debajo de otra) y la barra de
  avance aparte.
- Una tarjeta por categoría.
- Cada partida en dos líneas, con hasta cuatro botones a la vista
  ("Realizado", "Deshacer", lápiz y papelera): unos 100 px de alto cada una.

### 2.2 Cómo se verá

**Resumen**: una sola tarjeta. Arriba, en una fila de tres columnas,
Presupuestado, Realizado y Pendiente. En el móvil, Presupuestado ocupa su
fila y Realizado y Pendiente van debajo, para que quepan las cifras largas en
bolívares. Debajo, la barra de avance y "Gastos fuera del presupuesto".

**Partidas**: una sola tarjeta con todas, **sin agrupar por categoría y de
mayor a menor monto** (ajuste pedido tras aprobar la spec). Cada partida es
**un renglón** de unos 56 px:

```
 ○  Alquiler                                  $350,00
 ✓  Luz                                         $2,30
    Real $2,45 · 02/10 · Pago móvil  ↑ $0,15
 ○  Lista del supermercado  🛒 12 productos    $185,40
```

- **A la izquierda, el estado**: un círculo vacío (pendiente) o con ✓
  (realizada). Tocar el círculo de una pendiente abre "Marcar como realizado".
  Es un botón de 44 px, con su nombre para el lector de pantalla.
- **En el centro**: la descripción y, debajo y en pequeño, su categoría y el detalle. Si
  está realizada, el monto real, la fecha, el método y la diferencia (con
  icono y texto). Si tiene lista, cuántos productos tiene.
- **A la derecha**: el monto previsto.
- **Tocar el renglón** abre el **detalle de la partida** en un modal, con las
  acciones: Marcar como realizado o Deshacer, Corregir, Quitar y, si tiene
  lista, la lista.

Así no hay botones repetidos en cada renglón. Los lectores (rol) ven el
detalle sin acciones.

## 3. Lista del supermercado

### 3.1 Qué es

Una partida puede tener una **lista**: renglones con **producto**, **cantidad**
y **precio unitario en USD**. Cuando una partida tiene lista:

- Su **monto previsto es la suma de la lista** (cantidad × precio de cada
  producto). Lo calcula el backend cada vez que la lista cambia, y en el
  formulario de la partida el monto ya no se escribe a mano.
- Una lista no puede quedar vacía: hace falta al menos un producto (una
  partida siempre tiene un monto mayor que cero).

### 3.2 Cómo se crea

- **Botón "Lista del supermercado"** en Presupuesto, junto a "Agregar
  partida". Abre un formulario con:
  - Descripción, que empieza con el texto "Lista del supermercado".
  - Los productos.

  La categoría **no se elige**: es siempre la categoría de la lista del
  supermercado de la familia (Alimentación). Para no dejar ese nombre fijo en
  el código, la categoría lleva una marca `is_shopping_list` en la base de
  datos. Las familias nuevas la reciben marcada en Alimentación, y una
  migración la marca en las que ya existen. Si la familia no la tiene activa,
  el formulario lo avisa y no deja guardar.

  Al guardar, se crea la partida con su lista en el mes que se está viendo.
- En el **detalle de una partida pendiente** sin lista, "Agregar lista"
  convierte esa partida en una con lista.

### 3.3 Editar la lista

En el detalle de la partida:

- Cada producto en un renglón: nombre, cantidad (empieza en 1) y precio en $,
  con su total. Se pueden corregir y quitar.
- Al final, un renglón vacío para **agregar otro producto**. Enter salta al
  siguiente campo, pensado para ir escribiendo rápido en el móvil.
- Abajo, el **total de la lista**, que se actualiza mientras se escribe.
- "Guardar lista" guarda todos los productos de una vez y actualiza el monto
  de la partida.

### 3.4 Al comprar

Se marca como realizada como cualquier partida (spec 010, regla 7). El monto
real empieza con el total de la lista y se cambia por lo que se pagó de
verdad. El movimiento lleva la categoría y la descripción de la partida.

- Una partida **realizada** muestra su lista **solo para leer**. Para
  cambiarla hay que deshacerla antes.
- **Deshacer** deja la partida pendiente con su lista intacta.
- **Quitar** la partida borra también su lista.

### 3.5 El mes siguiente

En la propuesta del mes nuevo (spec 010, sección 4), una partida con lista
se propone **con su lista copiada** y con el **total de la lista** como monto
(no lo gastado de verdad, porque el monto tiene que coincidir con la lista).
Así cada mes se parte de la compra del mes anterior y solo se ajustan
precios y productos.

## 4. Reglas

1. Quién: lo mismo que el resto del presupuesto. Administradores y editores
   crean y cambian listas; los lectores las ven.
2. **Producto**: texto obligatorio de hasta 100 caracteres.
3. **Cantidad**: mayor que cero, hasta 9.999, con hasta 2 decimales (1,5 kg).
4. **Precio unitario**: en USD, mayor que cero y como mucho 999.999,99.
5. Una lista tiene **entre 1 y 200 productos**.
6. El total de cada producto se redondea a 2 decimales y el de la lista es
   la suma de esos totales (todo con `Decimal`).
7. Cada familia ve y toca solo lo suyo; lo de otra familia responde `404`.

## 5. Alcance

### 5.1 Modelo de datos

En la app `budget`, modelo nuevo **ShoppingListItem**:

| Campo | Tipo | Notas |
|---|---|---|
| `budget_item` | relación a BudgetItem | `CASCADE`: quitar la partida borra su lista. `related_name="shopping_list"` |
| `name` | texto (100) | "Leche" |
| `quantity` | decimal (6, 2) | Mayor que cero |
| `unit_price` | decimal (12, 2) | En USD |
| `position` | entero | Orden en la lista |

En `Category` (app `catalogs`), campo nuevo `is_shopping_list` (booleano): la
categoría de gasto de la lista del supermercado, que la API de catálogos
devuelve.

### 5.2 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `PUT budget/items/{id}/list/` | Admin y editor | Reemplaza la lista entera y recalcula el monto. `400` si la partida está realizada |
| `POST budget/items/` | Admin y editor | Además de lo de hoy, acepta `shopping_list`: la partida nace con su lista y su monto es el total |

- `GET budget/` añade a cada partida `shopping_list`: los productos con
  `name`, `quantity`, `unit_price` y `total` (en USD, que es como se
  escriben), o una lista vacía.
- `PATCH budget/items/{id}/` sobre una partida con lista no acepta `amount`
  (`400`: "El monto sale de la lista").
- `POST budget/proposal/` acepta `shopping_list` en cada partida, para copiar
  la lista.

### 5.3 Frontend

- `pages/Budget.jsx`: el resumen y los renglones compactos de la sección 2.
- `BudgetItemDetail` (nuevo): el modal del detalle, con acciones y lista.
- `ShoppingListEditor` (nuevo): la lista editable de la sección 3.3.
- Se reutilizan `BudgetItemForm`, `RealizeForm`, `Modal`, `Button`, `Field` e
  `IconButton`.
- Animaciones con `lib/motion.js`: un producto nuevo entra animado y uno
  quitado sale; el total cuenta hasta su valor.

## 6. Fuera de alcance

- Ir marcando productos como "ya en el carrito" mientras se compra.
- Precios en bolívares o euros en la lista (se escriben en USD).
- Un catálogo de productos o precios guardados aparte de las listas.
- Listas fuera del presupuesto (sin partida).
- Compartir o imprimir la lista.

## 7. Criterios de aceptación

**Presupuesto compacto**

1. El resumen es una sola tarjeta con las tres cifras en una fila, también a
   360 px y sin desplazamiento horizontal.
2. Cada partida ocupa un renglón con estado, descripción, categoría, detalle y
   monto; las partidas van sin agrupar, de mayor a menor monto.
3. Tocar el círculo de una pendiente abre "Marcar como realizado"; tocar el
   renglón abre el detalle con las acciones. Todo funciona con teclado, y los
   botones y renglones miden 44 px como mínimo.
4. Los lectores ven el detalle sin acciones.

**Lista del supermercado**

5. "Lista del supermercado" crea una partida con su lista en el mes que se
   ve, y su monto es el total de la lista.
6. Al guardar la lista, el monto de la partida pasa a ser el nuevo total.
   Las cuentas se hacen con `Decimal` y redondeo a 2 decimales.
7. No se puede escribir a mano el monto de una partida con lista, ni guardar
   una lista vacía, ni cambiar la lista de una partida realizada (`400` con
   mensaje en español).
8. Marcar como realizada propone el total de la lista y crea el movimiento;
   deshacer la deja pendiente con su lista; quitarla borra su lista.
9. La propuesta del mes siguiente copia la lista y usa su total como monto.
10. Lo de otra familia responde `404`, y un lector recibe `403` al intentar
    cambiar una lista.

**Pruebas**

11. Hay pruebas automáticas del backend para los criterios 5 a 10, y pasan.

## 8. Decisiones a revisar

1. **La lista vive dentro de una partida**, no como algo aparte que después se
   pregunta si se agrega. Así no hay un paso extra ni listas sueltas que
   olvidar: el botón "Lista del supermercado" ya crea la partida, y su monto
   siempre es el de la lista.
2. **Producto, cantidad y precio unitario** (y no solo producto y precio),
   para escribir "2 × leche a $1,80" sin hacer cuentas.
3. **La lista de una partida realizada no se cambia**: es el registro de lo
   que se planeó comprar. Para cambiarla, se deshace.
4. **El mes siguiente copia la lista** con el total de la lista como monto.
5. **Precios solo en USD**, como se pidió. Escribirlos en Bs. con la tasa de
   hoy podría venir después.
6. **Las acciones pasan al detalle** (tocar el renglón) en vez de estar a la
   vista en cada renglón. Solo "Marcar como realizado" se queda a un toque,
   en el círculo.
