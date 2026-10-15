# Spec 005 — Tasas BCV y vista en USD, bolívares y euros

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 003 (monedas) y spec 004 (movimientos) |
| **Desbloquea** | Spec 006 (dashboard), 007 (comparación) y 008 (exportación), que mostrarán montos en la moneda elegida |

## 1. Objetivo

Que la familia pueda anotar un movimiento en dólares, bolívares o euros, y ver
todos sus montos en cualquiera de las tres monedas, convertidos con la tasa
oficial del BCV de hoy.

Al terminar esta spec, quien paga 1.500 Bs. en el mercado lo anota tal cual y
la aplicación lo guarda en USD. Cualquier miembro puede ver la lista y los
totales del mes en bolívares o en euros. Si la aplicación no consigue la tasa
de hoy, avisa de que la tasa que usa no está actualizada.

## 2. De dónde sale la tasa

El BCV **no tiene una API pública**. Su página principal (`bcv.org.ve`) publica
la tasa del dólar y del euro con su "Fecha Valor", que es el día en que esa
tasa entra en vigor. La aplicación lee esa página y saca los dos números. Como
no es una API, si el BCV cambia el diseño de la página habrá que ajustar el
lector; las pruebas usan una copia guardada de la página para detectarlo.

- La tasa se expresa en **bolívares por unidad**: 1 USD = 877,90 Bs.;
  1 EUR = 982,76 Bs.
- De dólar a euro se pasa por el bolívar: 1 USD = 877,90 / 982,76 = 0,8933 EUR.
- La "tasa de hoy" es la más reciente cuya Fecha Valor sea hoy o anterior. El
  BCV publica por la tarde la tasa del día siguiente hábil; esa se guarda, pero
  no se usa hasta que llegue su día.

### 2.1 Se actualiza todos los días

La tasa se actualiza **todos los días, también sábados y domingos**. No hay
tareas programadas: la aplicación consulta al BCV la primera vez en el día que
algún miembro abre una pantalla con montos o anota un movimiento en otra
moneda.

- Si ya se leyó la página del BCV hoy, no se vuelve a consultar.
- Si la consulta falla (página caída, tarda más de 10 segundos o tiene un
  formato inesperado), no se reintenta hasta pasados 15 minutos. Así una caída
  del BCV no hace lentas todas las pantallas.
- Hay además un comando, `python manage.py fetch_bcv_rates`, para forzar la
  consulta a mano.

### 2.2 Relleno de días que faltan

El viernes por la tarde el BCV ya publica la tasa del lunes, y desde ese
momento la del viernes desaparece de su página. Si nadie abrió la aplicación a
tiempo, faltaría la del viernes. Para que **la tasa de cada día hábil quede
siempre guardada**:

- En la consulta diaria, después de leer el BCV, se mira si a algún día de
  lunes a viernes de los últimos 7 días le falta su tasa.
- Si falta alguno, se pide el histórico de tasas oficiales de DolarAPI
  (`ve.dolarapi.com/v1/historicos/dolares/oficial` y `.../euros/oficial`) y se
  guardan los días que falten.
- El histórico solo rellena huecos: nunca reemplaza una tasa leída del BCV.
- Si un día hábil tampoco está en el histórico es porque fue feriado (por
  ejemplo, el 12 de octubre) y no tiene tasa.
- Cada tasa guarda de dónde salió: `bcv` o `dolarapi`.

### 2.3 Avisos al usuario

La tasa que se usa tiene uno de estos cuatro estados. En todos menos el
primero se muestra un aviso con icono, la fecha de la tasa usada y su valor:

| Estado | Cuándo | Aviso |
|---|---|---|
| `current` | Hay tasa con Fecha Valor de hoy | Ninguno |
| `previous_business_day` | Hoy el BCV no publica (fin de semana o feriado) y se usa la del último día hábil | "Hoy es sábado y el BCV no publica tasa. Se usa la del viernes 9 de octubre: 1 $ = 875,65 Bs." (en un feriado: "Hoy el BCV no publicó tasa…") |
| `outdated` | Hoy no se pudo leer el BCV | "La tasa del BCV no está actualizada. Se usa la del 11 de octubre: 1 $ = 875,20 Bs." |
| `missing` | Nunca se ha guardado una tasa | "Todavía no hay tasa del BCV; solo se puede usar dólares." |

Si a la vez es fin de semana y el BCV no respondió, manda `outdated`: lo
importante es avisar de que puede faltar una tasa más reciente.

Con `missing` (por ejemplo, la primera vez que se instala la aplicación y no
responden ni el BCV ni DolarAPI) solo se puede usar USD. Las opciones de
bolívares y euros aparecen desactivadas con el motivo.

## 3. Alcance

### 3.1 Modelo de datos

Nueva app de Django: `rates`.

**ExchangeRate**

| Campo | Tipo | Notas |
|---|---|---|
| `currency` | relación a Currency | USD o EUR |
| `date` | fecha | La Fecha Valor del BCV |
| `bs_per_unit` | decimal (20 dígitos, 8 decimales) | Bolívares por 1 unidad. El BCV publica 8 decimales |
| `source` | texto | `bcv` o `dolarapi` |
| `fetched_at` | fecha y hora | La última vez que se guardó o se confirmó |

Una sola tasa por moneda y día (restricción única). Si se lee dos veces del
BCV, se actualiza la existente; una del BCV reemplaza a una de DolarAPI, nunca
al revés. No se guarda tasa para el bolívar: vale siempre 1.

Para saber si hoy ya se leyó el BCV se mira el `fetched_at` más reciente de las
tasas con `source = bcv`.

La lista "qué moneda está en qué parte de la página del BCV" (`USD` → `dolar`,
`EUR` → `euro`) es parte del lector, no algo que el usuario elija, por eso vive
en el código.

**Movement** (cambios)

| Campo | Tipo | Notas |
|---|---|---|
| `amount` | sin cambios | Sigue siendo el monto en USD; con él se calcula todo |
| `original_amount` | decimal (16 dígitos, 2 decimales) | Lo que la persona escribió: 1500.00 |
| `original_currency` | relación a Currency | En qué moneda lo escribió: VES |
| `exchange_rate` | decimal (20, 8), opcional | Bolívares por unidad de la moneda original usados al convertir. Vacío si se anotó en USD |

Una migración rellena los movimientos que ya existen con
`original_amount = amount` y `original_currency = USD`.

### 3.2 Reglas

1. **Siempre la tasa de hoy; el USD no cambia.** El monto en USD de un
   movimiento queda fijo para siempre. Al anotar, al corregir y al mostrar en
   bolívares o euros se usa la tasa de hoy, nunca la del día del movimiento: un
   gasto de agosto visto hoy en bolívares aparece con la tasa de hoy.
2. **Anotar en otra moneda.** Si se anota en VES o EUR, el backend lo convierte
   a USD con la tasa de hoy y guarda también lo que se escribió y la tasa
   usada.
3. **Corregir.** Si no cambian ni el monto original ni su moneda, el monto en
   USD queda como estaba (cambiar solo la categoría no altera el dinero). Si
   cambia alguno de los dos, se vuelve a convertir con la tasa de hoy.
4. **Redondeo.** Las conversiones se hacen con `Decimal` y se redondean a dos
   decimales con la regla de siempre (0,005 sube).
5. **Límites.** El monto convertido a USD debe estar entre 0,01 y
   9.999.999,99, como en la spec 004. Si 0,01 Bs. da menos de 0,01 USD, se
   rechaza con un mensaje que lo explica.
6. **Sin tasa no hay conversión.** Si nunca se ha guardado una tasa, anotar o
   ver en VES o EUR responde `400` con "Todavía no hay tasa del BCV; usa
   dólares". Una tasa del último día hábil o no actualizada sí se usa, con su
   aviso.
7. **Solo monedas activas.** Solo se puede anotar y ver en monedas activas del
   catálogo.

### 3.3 API

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET rates/current/` | Cualquier miembro | La tasa de hoy y si está actualizada |
| `GET movements/?currency=VES` | Cualquier miembro | Como en la spec 004, con montos y totales en esa moneda |
| `POST movements/`, `PATCH movements/{id}/` | Como en la spec 004 | Aceptan `currency` |

`GET rates/current/`:

```json
{
  "date": "2026-10-14",
  "status": "current",
  "rates": [
    { "currency": "USD", "bs_per_unit": "877.90230000" },
    { "currency": "EUR", "bs_per_unit": "982.75895071" }
  ]
}
```

`status` es uno de los cuatro estados de la sección 2.3. Con `missing`, `date`
y `rates` vienen vacíos. Los textos de los avisos los arma el frontend.

`GET movements/` acepta un parámetro nuevo, `currency` (`USD` por defecto).
Con él, `amount` de cada movimiento y los tres totales vienen convertidos a esa
moneda. Cada movimiento trae además lo que se anotó, para mostrarlo y para
precargar el formulario al corregir:

```json
{
  "month": "2026-10",
  "currency": "VES",
  "rate": { "date": "2026-10-14", "status": "current", "rates": ["igual que rates/current/"] },
  "totals": { "income": "1053482.76", "expense": "742082.35", "balance": "311400.41" },
  "movements": [
    {
      "id": 31,
      "amount": "39768.97",
      "original_amount": "45.30",
      "original_currency": "USD",
      "...": "el resto, como en la spec 004"
    }
  ]
}
```

Los ingresos y los gastos se suman en USD y se convierte cada total, para que no
se acumulen errores de redondeo. El balance es la resta de los dos ya
convertidos, para que en pantalla cuadre al céntimo.

Para crear o corregir se envía lo mismo que en la spec 004 más `currency`
(código; `USD` si falta). `amount` es lo que la persona escribió, en esa
moneda.

### 3.4 Frontend

- **Selector de moneda** ($ · Bs. · €) con `SegmentedControl`, en la pantalla
  de Movimientos, junto al selector de mes. Los símbolos salen del catálogo.
  Cambia la lista y los totales. La elección se recuerda en el dispositivo
  (`localStorage`); por defecto, USD.
- **Tasa visible**: debajo del selector, una línea discreta: "Tasa BCV del 14
  de octubre: 1 $ = 877,90 Bs. · 1 € = 982,76 Bs.".
- **Avisos**: un `Alert` de advertencia con icono y el texto de la sección 2.3
  (fin de semana o feriado, no actualizada, sin tasa), en Movimientos y en el
  formulario. No bloquea nada.
- **Formulario**: junto al monto, un selector de moneda. Por defecto, la que
  esté elegida en la pantalla. Si no es USD, debajo del monto aparece el
  equivalente: "≈ $1,71 con la tasa de hoy". Ese número es solo una guía; el
  que vale es el que calcula el backend.
- **Al corregir**, el formulario se precarga con el monto y la moneda
  originales.
- **En la lista**, si un movimiento se anotó en otra moneda distinta de la que
  se está viendo, se muestra debajo en pequeño: "Anotado: Bs. 1.500,00".
- Sin ninguna tasa guardada, Bs. y € aparecen desactivados con el motivo.
- Montos con `lib/format.js`. Esqueleto mientras carga la tasa.
- Animaciones con `lib/motion.js`: al cambiar de moneda, las cifras hacen la
  misma transición breve que al cambiar de mes. El aviso entra y sale animado.
  Todo respeta "reducir movimiento".

### 3.5 Librerías nuevas

- `requests`: para pedir la página del BCV y el histórico de DolarAPI con
  tiempo límite.
- `beautifulsoup4`: para sacar los números de la página sin expresiones
  regulares frágiles.
- `truststore`: el servidor del BCV no envía su certificado intermedio y Python
  rechaza la conexión. `truststore` valida con el almacén de certificados del
  sistema operativo, sin desactivar la verificación.

## 4. Fuera de alcance

- Agregar monedas nuevas desde la aplicación (siguen en `/admin/`).
- Otras tasas del BCV (yuan, lira, rublo) y tasas no oficiales (paralelo).
- Historial y gráfico de la tasa.
- Anotar a mano una tasa cuando el BCV no responde.
- Ver los montos con la tasa del día en que ocurrieron.
- Consultar al BCV con una tarea programada (cron).

## 5. Criterios de aceptación

**Tasas**

1. El lector de la página del BCV saca las tasas del dólar y del euro y su
   Fecha Valor de una copia guardada de la página, como `Decimal`.
2. La primera petición del día que necesita la tasa consulta al BCV y la
   guarda, también en sábado y domingo; las siguientes de ese día no vuelven a
   consultar.
3. Si el BCV falla, se usa la última tasa guardada con `status: outdated`, y no
   se reintenta antes de 15 minutos.
4. Una tasa con Fecha Valor de mañana se guarda pero no se usa hasta mañana.
5. El sábado y el domingo se usa la del viernes con
   `status: previous_business_day`, aunque nadie abriera la aplicación el
   viernes: el hueco se rellena con el histórico de DolarAPI.
6. El relleno solo guarda días que faltan y nunca reemplaza una tasa del BCV.
   Un feriado sin tasa no rompe nada.
7. `fetch_bcv_rates` consulta y guarda aunque ya se haya consultado hoy.
8. Sin ninguna tasa guardada, `rates/current/` responde `status: missing`, y
   anotar o ver en VES o EUR responde `400` con el mensaje en español.

**Movimientos**

9. Un gasto anotado en VES se guarda en USD convertido con la tasa de hoy, con
   su monto, moneda y tasa originales.
10. Uno anotado en EUR se convierte pasando por el bolívar, con redondeo a dos
    decimales.
11. Al corregir solo la categoría, el monto en USD no cambia. Al corregir el
    monto o la moneda, se reconvierte con la tasa de hoy.
12. Se rechaza con `400`: moneda inexistente o desactivada, y un monto que en
    USD queda por debajo de 0,01 o por encima del máximo.
13. `GET movements/?currency=VES` devuelve montos y totales convertidos con la
    tasa de hoy; los totales coinciden con convertir los totales en USD.
14. Los movimientos que ya existían quedan como anotados en USD.
15. Sin sesión, `rates/current/` responde `401`.

**Frontend**

16. El selector de moneda cambia la lista y los totales, y se recuerda al
    volver a la pantalla.
17. Se ve la tasa usada. El aviso de fin de semana o feriado, el de tasa no
    actualizada y el de sin tasa aparecen solo en su caso.
18. Al anotar en Bs. se ve el equivalente aproximado en USD, y al corregir el
    formulario muestra el monto y la moneda originales.
19. Las animaciones funcionan y se desactivan con "reducir movimiento".
20. La pantalla se usa bien a 360 px de ancho.

**Pruebas**

21. Hay pruebas automáticas del backend para los criterios 1 a 15. Ninguna
    prueba llama al BCV ni a DolarAPI de verdad.

## 6. Decisiones a revisar

Ya decididas con el usuario:

- **La tasa de hoy también para el pasado**, y el monto en USD nunca cambia.
- **Fin de semana: obligatoriamente la tasa del viernes, con aviso.** Para
  garantizarla se rellenan los huecos con el histórico de DolarAPI.

Pendientes de revisar:

1. **Se guarda lo que se escribió.** Además del monto en USD se guarda el monto,
   la moneda y la tasa originales, para mostrar "Anotado: Bs. 1.500,00" y para
   que al corregir no tengas que recordar cuánto fue en dólares.
2. **Los feriados se tratan como el fin de semana**: se usa la tasa del último
   día hábil, con aviso.
3. **DolarAPI solo rellena huecos.** La tasa de hoy sale siempre de la página
   del BCV. Si el BCV no responde, no se usa DolarAPI para la tasa de hoy, sino
   que se muestra el aviso de no actualizada. DolarAPI no es oficial; si algún
   día deja de funcionar, el relleno falla en silencio y todo lo demás sigue
   igual.
4. **Sin tareas programadas.** La tasa se consulta todos los días cuando
   alguien la necesita, así no hay que mantener un cron. La primera pantalla
   del día puede tardar un par de segundos más.
5. **La moneda elegida se recuerda por dispositivo**, no por usuario. Es lo más
   simple; si quieres que te siga entre el móvil y el ordenador, se guardaría
   en la base de datos.
6. **El selector de moneda solo está en Movimientos** por ahora. El dashboard
   (spec 006) lo reutilizará.

Decididas durante la implementación:

7. **La lista trae la tasa completa** (`rate` con `rates`), no solo fecha y
   estado. Así la pantalla hace una sola petición y no dos consultas al BCV a
   la vez.
8. **"Anotado: Bs. 1.500,00" también en la misma moneda.** 1.500 Bs. se guardan
   como 1,71 $ (dos decimales) y, al verlos en bolívares, salen Bs. 1.501,21.
   Cuando el monto mostrado no coincide con lo escrito, se muestra lo escrito
   debajo para que no parezca un error.
9. **Totales en filas en el móvil.** Las cifras en bolívares no cabían en las
   tarjetas a 360 px; en el móvil cada total es una fila (etiqueta a la
   izquierda, cifra a la derecha). Desde 640 px siguen siendo tarjetas.
10. **El orden del selector es $ · € · Bs.**, el del catálogo (moneda base y luego
    por código).
11. **El relleno con DolarAPI se reintenta** cada 15 minutos el mismo día si
    falló, aunque el BCV ya se haya leído.
12. **Un movimiento conserva su moneda** aunque esta se desactive, como pasa con
    las categorías.
13. **En producción (Linux) hay que comprobar el certificado del BCV.**
    `truststore` resuelve el certificado intermedio en Windows; en Linux puede
    hacer falta instalarlo en el sistema.
