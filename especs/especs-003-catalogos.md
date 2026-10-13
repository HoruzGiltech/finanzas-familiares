# Spec 003 — Catálogos parametrizados

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 002 |
| **Desbloquea** | Spec 004 (registrar movimientos necesita categorías, métodos de pago y monedas) |

## 1. Objetivo

Que todas las listas entre las que el usuario elige al registrar un movimiento
vivan en la base de datos y no en el código: tipos de movimiento, monedas,
categorías y métodos de pago.

Al terminar esta spec el administrador puede preparar las categorías y los
métodos de pago de su familia. Todavía no se registran movimientos.

## 2. Los cuatro catálogos

| Catálogo | De quién es | Quién lo modifica | Ejemplos |
|---|---|---|---|
| Tipos de movimiento | Del sistema (igual para todos) | Nadie desde la aplicación | Ingreso, Gasto |
| Monedas | Del sistema | Nadie desde la aplicación | USD, VES, EUR |
| Categorías | De cada familia | El administrador de la familia | Alimentación, Salario |
| Métodos de pago | De cada familia | El administrador de la familia | Efectivo, Pago móvil |

Los catálogos del sistema se cargan con una migración de datos y, si hiciera
falta, se editan desde el panel `/admin/` de Django. Son del sistema porque de
ellos depende la lógica: un tipo decide si el monto suma o resta, y las monedas
dependen de las tasas del BCV (spec 005).

## 3. Alcance

### 3.1 Modelo de datos

Nueva app de Django: `catalogs`.

**MovementType** (del sistema)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | texto, único | `income` o `expense`. Lo usa el código |
| `name` | texto | "Ingreso", "Gasto". Lo ve el usuario |
| `sign` | entero | `1` suma, `-1` resta |

**Currency** (del sistema)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | texto (3), único | `USD`, `VES`, `EUR` |
| `name` | texto | "Dólar estadounidense", "Bolívar", "Euro" |
| `symbol` | texto | `$`, `Bs.`, `€` |
| `is_base` | sí/no | Verdadero solo en USD |
| `is_active` | sí/no | |

**Category** (de la familia)

| Campo | Tipo | Notas |
|---|---|---|
| `family` | relación a Family | |
| `movement_type` | relación a MovementType | Una categoría es de ingreso o de gasto |
| `name` | texto (60) | |
| `is_active` | sí/no | Las desactivadas no se ofrecen al registrar |
| `created_at` | fecha y hora | |

**PaymentMethod** (de la familia)

| Campo | Tipo | Notas |
|---|---|---|
| `family` | relación a Family | |
| `name` | texto (60) | |
| `is_active` | sí/no | |
| `created_at` | fecha y hora | |

### 3.2 Datos iniciales

**Del sistema** (migración de datos):

- Tipos: Ingreso (`income`, +1) y Gasto (`expense`, −1).
- Monedas: USD (base), VES y EUR.

**De cada familia nueva** (se crean al registrarla, para no empezar en blanco):

- Categorías de gasto: Alimentación, Vivienda, Servicios, Transporte, Salud,
  Educación, Entretenimiento, Ropa y calzado, Otros gastos.
- Categorías de ingreso: Salario, Negocio propio, Remesas, Otros ingresos.
- Métodos de pago: Efectivo, Pago móvil, Transferencia, Tarjeta de débito,
  Tarjeta de crédito, Zelle.

La lista de valores iniciales vive en un solo archivo (`catalogs/defaults.py`).
Es el único lugar del código con nombres de categorías, y solo sirve como
punto de partida: después cada familia las cambia a su gusto.

### 3.3 Reglas

1. Solo el administrador crea, renombra, activa o desactiva categorías y
   métodos de pago. Editores y lectores solo los leen.
2. Cada familia ve y modifica únicamente lo suyo. Un elemento de otra familia
   responde `404`.
3. No se repiten nombres dentro de una familia: dos categorías del mismo tipo
   no pueden llamarse igual, ni dos métodos de pago. La comparación ignora
   mayúsculas y espacios sobrantes ("alimentación " es igual a "Alimentación").
4. Nada se borra: se desactiva. Así los movimientos antiguos conservan su
   categoría aunque ya no se ofrezca para los nuevos.
5. El tipo de una categoría no se puede cambiar después de crearla (dejaría
   movimientos de gasto en una categoría de ingreso).
6. No se puede desactivar la última categoría activa de un tipo, ni el último
   método de pago activo: siempre debe quedar algo que elegir.

### 3.4 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET catalogs/` | Cualquier miembro | Devuelve los cuatro catálogos en una sola respuesta, para llenar formularios |
| `POST categories/` | Administrador | Crea una categoría (`name`, `movement_type`) |
| `PATCH categories/{id}/` | Administrador | Cambia `name` o `is_active` |
| `POST payment-methods/` | Administrador | Crea un método de pago (`name`) |
| `PATCH payment-methods/{id}/` | Administrador | Cambia `name` o `is_active` |

`GET catalogs/` devuelve por defecto solo lo activo. Con `?include_inactive=1`
(solo administrador) incluye también lo desactivado, para la pantalla de
configuración.

```json
{
  "movement_types": [{ "id": 1, "code": "income", "name": "Ingreso" }],
  "currencies": [{ "id": 1, "code": "USD", "name": "Dólar estadounidense", "symbol": "$", "is_base": true }],
  "categories": [{ "id": 7, "name": "Alimentación", "movement_type": "expense", "is_active": true }],
  "payment_methods": [{ "id": 3, "name": "Efectivo", "is_active": true }]
}
```

### 3.5 Frontend

Pantalla nueva `/configuracion`, solo para administradores, con su enlace
"Configuración" en la navegación. Tiene tres secciones:

- **Categorías**: dos listas, "Gastos" e "Ingresos". En cada una se puede
  agregar, renombrar en el propio renglón, y activar o desactivar.
- **Métodos de pago**: una lista con las mismas acciones.
- **Monedas**: lista de solo lectura con la moneda base marcada, y una nota de
  que las tasas llegarán con la spec 005.

Detalles:

- Las desactivadas se muestran atenuadas al final de su lista, con la etiqueta
  "Desactivada".
- Los errores de nombre repetido aparecen junto al campo.
- Se reutilizan los componentes existentes (`Button`, `Field`, `Card`, `Modal`,
  `Alert`, `Skeleton`). El renglón editable se extrae como componente común,
  porque categorías y métodos de pago se comportan igual.
- Con cuatro enlaces, la navegación en móvil pasa a mostrarse como barra
  inferior fija con iconos y texto.

Animaciones, con los valores de `lib/motion.js`:

- Entrada escalonada de cada lista.
- Un elemento nuevo aparece animado; al desactivarlo se desplaza al final de
  la lista de forma animada.
- Cambio entre modo lectura y modo edición del renglón.
- Esqueleto mientras cargan los catálogos.
- Todo respeta "reducir movimiento".

## 4. Fuera de alcance

- Subcategorías (por ejemplo, Alimentación → Mercado, Restaurantes).
- Color o icono elegido por el usuario para cada categoría. Los colores de los
  gráficos se deciden en la spec 006 con la skill `dataviz`.
- Ordenar las listas a mano. Se ordenan alfabéticamente.
- Presupuesto por categoría.
- Tasas de cambio y agregar monedas nuevas desde la aplicación (spec 005).
- Borrar definitivamente.

## 5. Criterios de aceptación

**Datos iniciales**

1. Tras las migraciones existen los 2 tipos de movimiento y las 3 monedas, con
   USD como única moneda base.
2. Una familia recién registrada tiene las 13 categorías y los 6 métodos de
   pago iniciales.

**Lectura**

3. Cualquier miembro (administrador, editor o lector) obtiene `GET catalogs/`
   con los cuatro catálogos de su familia y solo elementos activos.
4. Solo el administrador obtiene también los desactivados con
   `?include_inactive=1`; a los demás roles el parámetro no les cambia nada.
5. La respuesta nunca incluye categorías ni métodos de pago de otra familia.

**Escritura**

6. El administrador crea, renombra, desactiva y reactiva categorías y métodos
   de pago.
7. Un editor o un lector reciben `403` en todas las rutas de escritura.
8. Modificar un elemento de otra familia responde `404` y no lo cambia.
9. Un nombre repetido en la misma familia y tipo responde `400` con el error
   en español, ignorando mayúsculas y espacios. El mismo nombre sí se permite
   en otra familia, y en el otro tipo de movimiento.
10. Enviar `movement_type` en un `PATCH` no cambia el tipo de la categoría.
11. Desactivar la última categoría activa de un tipo, o el último método de
    pago activo, responde `400`.
12. Sin sesión, todas las rutas responden `401`.

**Frontend**

13. Un administrador ve "Configuración" y puede agregar, renombrar, desactivar
    y reactivar desde la pantalla.
14. Un editor o lector no ve el enlace, y abrir `/configuracion` a mano lo
    devuelve a `/`.
15. Las animaciones de la sección 3.5 funcionan y se desactivan con "reducir
    movimiento".
16. La pantalla se usa bien a 360 px de ancho, con la navegación inferior.

**Pruebas**

17. Hay pruebas automáticas del backend para los criterios 1 a 12, y pasan.

## 6. Decisiones a revisar

1. **Tipos de movimiento y monedas son del sistema**, no editables por la
   familia. Están en la base de datos, pero se cambian solo desde el panel de
   Django.
2. **Categorías iniciales**: la lista de la sección 3.2 es una propuesta
   pensada para una familia en Venezuela. Dime si quitas, añades o renombras.
3. **Sin subcategorías** por ahora. Detectan mejor las fugas de dinero, pero
   complican el registro diario. Se pueden añadir en una spec posterior sin
   rehacer lo anterior.
4. **Sin color ni icono por categoría**; los colores de los gráficos se asignan
   en la spec 006.
5. **Desactivar en vez de borrar**, igual que con los usuarios.
6. **Navegación inferior en móvil**: cambia el encabezado hecho en la spec 002.
