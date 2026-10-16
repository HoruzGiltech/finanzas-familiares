# Spec 015 — Moneda para ver de la familia

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 005 (vista en otras monedas), 006 (dashboard), 010 (presupuesto) y 013 (moneda para anotar) |

## 1. Objetivo

Que el administrador decida en qué moneda ve la familia sus montos por
defecto. Una familia que vive en Chile ve Inicio, Movimientos y Presupuesto
en pesos chilenos sin que cada miembro tenga que elegirlo.

**Por dentro no cambia nada**: los montos se siguen guardando en USD (regla
fija del proyecto). Es la moneda en que se *muestran*, convertida con la tasa
de hoy, como ya hace el selector "Ver montos en".

## 2. Reglas

1. Nuevo ajuste de la familia: **moneda para ver**. Por defecto USD.
2. Solo el administrador la cambia, en Configuración → Monedas, junto a la
   moneda para anotar. La API responde `403` a editores y lectores. Solo se
   pueden elegir monedas activas.
3. Inicio, Movimientos y Presupuesto abren en esa moneda.
4. Cada persona puede seguir cambiando la vista con "Ver montos en"; su
   elección se recuerda en su dispositivo, como hasta ahora.
5. **Cuando el administrador cambia la moneda para ver, manda ella**: la
   elección guardada en cada dispositivo se olvida y todos pasan a ver la
   nueva. (Se guarda junto con la elección la moneda de la familia que regía
   al hacerla; si ya no coincide, se descarta.)
6. Si la moneda para ver no tiene tasa ese día, se ve en USD con el aviso de
   siempre.

## 3. Alcance

### 3.1 Backend

- `accounts.Family`: nuevo campo `view_currency` (FK a `Currency`, `PROTECT`,
  por defecto USD). La migración pone USD a las familias que ya existen.
- `FamilySerializer` devuelve `view_currency` (código).
- `PATCH /api/family/` acepta `entry_currency`, `view_currency` o los dos.
  Sigue siendo solo para el administrador.

### 3.2 Frontend

- `lib/currency.js`: `savedCurrency` y `saveCurrency` reciben la moneda para
  ver de la familia y aplican la regla 5.
- Inicio, Movimientos y Presupuesto empiezan con esa moneda.
- Configuración → Monedas: segundo selector "Moneda para ver".

## 4. Fuera de alcance

- Guardar los montos en otra moneda que no sea USD.
- El CSV de exportación: sigue con el monto en USD y el original.

## 5. Criterios de aceptación

1. El administrador cambia la moneda para ver a CLP; un editor que lo intenta
   recibe `403`.
2. Con CLP como moneda para ver, un miembro que abre Inicio por primera vez
   en su dispositivo ve los montos en CLP$.
3. Si ese miembro cambia a $ y recarga, sigue en $. Si después el
   administrador cambia la moneda para ver a €, al recargar ve €.
4. Los montos guardados en USD no cambian.

## 6. Decisiones a revisar

- **Nombre "moneda para ver"** en vez de "moneda base": "base" es la moneda
  en que se guarda todo (USD) y así lo dice ya Configuración.
- **Regla 5**: el cambio del administrador pisa la elección de cada
  dispositivo.
