# Spec 013 — Peso chileno y moneda para anotar

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 003 (monedas), 004 (movimientos), 005 (tasas BCV) y 010 (presupuesto) |

## 1. Objetivo

Que una familia que vive en Chile pueda anotar sus gastos e ingresos en pesos
chilenos (CLP) y ver cuánto representan en dólares, bolívares y euros.

Al terminar esta spec:

- El peso chileno es una moneda más del catálogo, con su tasa diaria.
- El administrador elige en Configuración la **moneda para anotar** de su
  familia. Los formularios de movimientos y presupuesto vienen con esa moneda
  ya elegida.
- Los montos se siguen guardando en USD. La lista, el dashboard y la
  exportación se pueden ver también en pesos chilenos.

## 2. De dónde sale la tasa del peso chileno

El BCV no publica el peso chileno. La tasa de referencia en Chile es el
**dólar observado** del Banco Central de Chile: cuántos pesos vale 1 USD. Se
publica cada día hábil chileno.

Fuentes posibles:

| Fuente | Qué da | Clave | Elegida |
|---|---|---|---|
| `mindicador.cl/api/dolar` | Dólar observado de los últimos ~30 días hábiles, en JSON | No | **Sí** |
| API de la CMF (`api.cmfchile.cl`) | Dólar observado, fuente pública oficial | Sí (gratis, con registro) | No |
| API BDE del Banco Central de Chile | Dólar observado, fuente original | Sí (usuario y contraseña) | No |
| exchangerate-api y similares | Tipo de cambio de mercado, no oficial | Según plan | No |

Se elige **mindicador.cl** porque no pide clave, publica el mismo dato del
Banco Central y trae el histórico en la misma respuesta, así que los días que
falten se rellenan sin pedir nada más.

### 2.0 Respaldo: la tasa del peso no debe faltar

Hay tres capas, en este orden:

1. **mindicador.cl** (dólar observado). Fuente principal.
2. **open.er-api.com** (`/v6/latest/USD`, campo `CLP`). Sin clave, se
   actualiza a diario con el tipo de cambio de mercado (difiere del observado
   en menos de un 0,5 %). Solo se usa si mindicador falla, y se guarda con
   `source = "er-api"` para saber de dónde salió. Como con DolarAPI, nunca
   pisa una tasa del dólar observado ya guardada.
3. **La última tasa guardada.** Si las dos fuentes fallan, se usa la cotización
   más reciente que haya en la base de datos y el aviso dice de qué fecha es
   (igual que hoy con el BCV desactualizado). El peso solo queda sin tasa si
   nunca se ha conseguido ninguna.

Del lado del bolívar no cambia nada: el BCV ya tiene DolarAPI de respaldo y,
si falla, se usa su última tasa guardada.

### 2.1 Cómo se combina con el BCV

Las tasas del BCV están en bolívares por unidad. La del peso se guarda tal
como llega: **pesos por 1 USD**. Al calcular la tasa de hoy se pasa a
bolívares con el dólar del BCV:

```
Bs. por 1 CLP = (Bs. por 1 USD) / (CLP por 1 USD)
              = 877,90 / 984,09 = 0,8921 Bs.
```

Así las conversiones de siempre (`to_usd`, `from_usd`) sirven sin cambios, y
el campo `exchange_rate` de los movimientos sigue siendo "bolívares por unidad".

- La tasa del peso que se usa hoy es el dólar observado más reciente con fecha
  de hoy o anterior.
- Se consulta como la del BCV: la primera vez en el día que hace falta, y si
  falla no se reintenta hasta pasados 15 minutos. El comando
  `fetch_bcv_rates` también la consulta.
- Solo si nunca se ha guardado una cotización del peso (o nunca una del BCV),
  el peso no se puede elegir (igual que hoy el bolívar y el euro sin tasa).
- El aviso de la tasa (`RateNotice`) muestra la fecha del dólar observado
  cuando la moneda elegida es el peso.

## 3. Moneda para anotar

- Nuevo ajuste de la familia: **moneda para anotar**. Por defecto USD.
- Solo el administrador la cambia, en Configuración → Monedas. Solo se pueden
  elegir monedas activas. Editores y lectores la ven pero no la cambian.
- Los formularios de nuevo movimiento, nueva partida de presupuesto y "marcar
  como realizada" empiezan con esa moneda elegida. La persona puede cambiarla
  para ese movimiento concreto (por ejemplo, un gasto pagado en dólares).
- Si la moneda para anotar no tiene tasa ese día, el formulario empieza en USD
  y muestra el aviso de siempre.
- Corregir un movimiento sigue mostrando la moneda en la que se anotó.

## 4. Pesos sin decimales

El peso chileno no usa céntimos. Para no fijarlo en el código, la moneda
guarda cuántos decimales se muestran:

- Nuevo campo `Currency.decimals` (USD, EUR y VES: 2; CLP: 0).
- `format.js` usa ese valor al mostrar montos.
- Al anotar en CLP, la API rechaza montos con decimales ("El peso chileno no
  lleva decimales.").
- En USD se sigue guardando con 2 decimales.

## 5. Alcance

### 5.1 Modelo de datos

- `catalogs.Currency`: nuevo campo `decimals` (entero, por defecto 2).
- Migración de datos: crea la moneda `CLP` ("Peso chileno", símbolo `CLP$`,
  0 decimales, activa).
- `accounts.Family`: nuevo campo `entry_currency` (FK a `Currency`,
  `PROTECT`). La migración pone USD a las familias que ya existen.
- `rates.UsdQuote` (nuevo): `currency`, `date`, `units_per_usd` (Decimal),
  `source`, `fetched_at`. Única por moneda y día. Pensado para monedas que se
  cotizan contra el dólar y no salen del BCV.

### 5.2 Backend

- `rates/sources.py`: `read_clp()` lee `mindicador.cl/api/dolar` y devuelve
  `{fecha: Decimal}`; `read_clp_backup()` lee `open.er-api.com` y devuelve
  `(fecha, Decimal)`. Errores en `SourceError`, como las demás.
- `rates/services.py`: guarda las cotizaciones nuevas (sin pisar las que ya
  están) y añade `CLP` a `TodayRate.bs_per_unit` con la fórmula de la sección
  2.1. `rate_data` devuelve también la fecha de cada moneda.
- Serializer de movimientos y presupuesto: valida los decimales según la
  moneda.
- `GET /api/family/` devuelve `entry_currency`; `PATCH` lo acepta solo del
  administrador (`IsFamilyAdmin`), validado con serializer.

### 5.3 Frontend

- Configuración → Monedas: el peso aparece en la lista. Para el
  administrador, un `SegmentedControl` (o select en móvil si no cabe)
  "Moneda para anotar".
- `MovementForm`, `BudgetItemForm`, `RealizeForm`: valor inicial =
  `entry_currency` si se puede usar.
- `AmountField` y `CurrencyPicker`: aparecen los pesos; como `$` lo usa el
  dólar, el botón muestra `CLP$`.
- `format.js`: decimales desde el catálogo.

## 6. Fuera de alcance (para una spec futura)

- Guardar los montos en otra moneda base que no sea USD.
- Usar la tasa del día del movimiento en vez de la de hoy al anotar fechas
  pasadas (hoy tampoco se hace con bolívares y euros).
- Cambiar automáticamente la moneda en que se *ven* los montos: sigue siendo
  una preferencia de cada dispositivo.

## 7. Criterios de aceptación

1. Existe la moneda CLP en el catálogo y aparece en Configuración.
2. Con el dólar observado guardado, `GET /api/rates/today/` incluye CLP y su
   fecha.
3. El administrador cambia la moneda para anotar a CLP; un editor que lo
   intenta recibe `403`.
4. Con CLP como moneda para anotar, el formulario de nuevo movimiento empieza
   en CLP y muestra "≈ $ X con la tasa de hoy".
5. Un gasto de 50.000 CLP con dólar observado 984,09 se guarda como 50,81 USD,
   y se ve como 50.000 CLP$, su equivalente en Bs. y en €.
6. Un monto en CLP con decimales se rechaza con mensaje en español.
7. Si mindicador.cl falla, se guarda la tasa de open.er-api.com con su
   fuente. Si fallan las dos, se usa la última tasa guardada y el aviso dice
   su fecha.
8. Las pruebas simulan `rates.sources`; ninguna sale a internet.
9. Los movimientos ya guardados no cambian.

## 8. Decisiones tomadas

- **Fuente**: mindicador.cl (sin clave, publica el dato del Banco Central),
  con open.er-api.com de respaldo y la última tasa guardada como red final.
- **Símbolo `CLP$`**: en Chile se usa `$`, pero se confundiría con el dólar.
  Aprobado por el usuario.
- **CLP vía bolívar**: el peso se convierte pasando por la tasa BCV del dólar,
  para no cambiar cómo funcionan las conversiones.
- **La moneda para anotar es de la familia** y la decide el administrador.
- **Hora de Caracas** para todo, también para las familias en Chile.
