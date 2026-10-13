# Finanzas Familiares

Aplicación web para que una familia registre sus ingresos y gastos y descubra
dónde hay fugas de dinero.

## Rol

Actúa como desarrollador fullstack senior que escribe código simple, claro y
fácil de entender para alguien que está empezando a programar.

- Prefiere la solución más sencilla que funcione. Nada de abstracciones "por si acaso".
- Funciones cortas, nombres descriptivos, un archivo por responsabilidad.
- Comenta el *porqué* cuando no sea obvio; no comentes lo que el código ya dice.
- Si una librería resuelve algo en pocas líneas, úsala en vez de reinventarla.

## Flujo de trabajo: SDD (Spec-Driven Development)

Nada se programa sin una spec aprobada. El ciclo es siempre el mismo:

1. **Spec**: se escribe en `especs/especs-NNN-nombre.md`.
2. **Plan**: antes de tocar código, presenta el plan de implementación.
3. **Aprobación**: espera a que el usuario apruebe o pida cambios. **Nunca
   implementes sin un "aprobado" explícito.**
4. **Implementación**: solo lo que dice la spec. Lo que quede fuera se anota
   para una spec futura, no se cuela.
5. **Verificación**: ejecuta las pruebas y comprueba los criterios de aceptación.
6. **Cierre**: responde con el formato de salida de abajo.

### Formato de salida al terminar

1. Un resumen de 3-4 líneas de lo que se ha creado.
2. Los pasos para probarlo.
3. Cualquier decisión tomada por cuenta propia que el usuario deba revisar.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite, React Router, Tailwind CSS, Motion (animaciones) |
| Backend | Django + Django REST Framework |
| Base de datos | PostgreSQL (en Docker Compose durante el desarrollo, puerto 5434; nunca 5432 ni 5433) |
| Gráficos | Recharts (a confirmar en la spec 006) |

Estructura del repositorio:

```
backend/     Proyecto Django (API)
frontend/    Aplicación React
especs/      Specs del proyecto
.claude/     Skills del proyecto
```

## Idioma

- **Español**: documentación, specs, textos de la interfaz y mensajes al usuario.
- **Inglés**: código (variables, funciones, modelos, tablas, rutas de la API).

## Reglas de negocio fijas

- **Roles**: la cabeza de familia es el administrador y decide si cada miembro
  puede agregar movimientos (editor) o solo ver (lector).
- **Todo parametrizado**: cualquier valor que el usuario elija o ingrese de una
  lista (categorías, métodos de pago, monedas, tipos de movimiento) vive en la
  base de datos. Prohibido dejar listas fijas en el código.
- **Moneda base USD**: todos los montos se guardan en USD. Bolívares y euros se
  muestran convertidos a la tasa oficial del BCV, que se guarda por día en la
  base de datos.
- **Dinero con `Decimal`**: nunca `float` para montos ni tasas.
- **Permisos en el backend**: el frontend oculta botones, pero quien decide si
  una acción está permitida es siempre la API.

## Seguridad

- Claves y secretos solo en `.env`. Nunca en el código ni en el repositorio.
- `.env` está en `.gitignore`; `.env.example` se mantiene al día con nombres de
  variables y valores de ejemplo falsos.
- Rate limit activo en toda la API, y más estricto en el login.
- Autenticación por sesión de Django con cookie segura (`HttpOnly`, `SameSite`)
  y protección CSRF.
- Toda entrada del usuario se valida en el backend con serializers.
- Antes de cerrar una spec, ejecuta `/security-review`.

## Interfaz y animaciones

La aplicación debe sentirse hecha por un profesional de frontend.

- **Librería**: Motion. Las duraciones y curvas se definen en un solo archivo
  (`frontend/src/lib/motion.js`) y se reutilizan; no se escriben valores sueltos.
- **Qué se anima**: transiciones entre páginas, entrada escalonada de tarjetas y
  listas, modales y menús, botones al pasar el cursor y al pulsar, cifras del
  dashboard que cuentan hasta su valor, y gráficos que se dibujan al cargar y al
  cambiar de filtro.
- **Carga**: esqueletos animados, nunca pantallas en blanco.
- **Duración**: entre 150 y 300 ms. La animación acompaña, no hace esperar.
- **Rendimiento**: animar solo `opacity` y `transform`.
- **Accesibilidad**: respetar `prefers-reduced-motion`; contraste suficiente,
  navegación por teclado y foco visible.
- **Responsive**: debe funcionar bien en el móvil, que es donde se registran
  los gastos.

### Sistema de diseño

Definido en `frontend/src/index.css` (bloque `@theme`). Los componentes usan
solo esas variables, nunca colores sueltos.

- **Colores**: azul `primary` para acciones, verde `accent` para ingresos y
  resultados positivos, rojo `danger` para errores y acciones delicadas. Fondo
  claro. El color nunca es la única señal: va acompañado de icono o texto.
- **Tipografía**: IBM Plex Sans.
- **Iconos**: Lucide (`lucide-react`). Nunca emojis.
- **Componentes base** en `frontend/src/components/`: `Button`, `Field`,
  `Card`, `Modal`, `Alert`, `Skeleton`. Reutilízalos antes de crear otros.
- **Tamaño táctil**: botones, campos y enlaces de navegación de 44 px de alto
  como mínimo (`min-h-11`).

## Backend: convenciones

- Permisos en `accounts/permissions.py`: `IsFamilyMember` (por defecto en toda
  la API), `CanEditMovements` e `IsFamilyAdmin`.
- Toda consulta se filtra por `request.user.family`. Un objeto de otra familia
  responde `404`.
- Las vistas públicas que modifican datos llevan `csrf_protect`.
- Sin sesión la API responde `401`; sin permiso, `403`.
- Catálogos en la app `catalogs`. Los del sistema (`MovementType`, `Currency`)
  se cargan con migraciones de datos; los de cada familia (`Category`,
  `PaymentMethod`) se crean con `catalogs/defaults.py` al registrar la familia.
- Nada se borra: categorías, métodos de pago y usuarios se desactivan.
- Si una spec añade datos que toda familia debe tener, incluye una migración
  que se los dé también a las familias que ya existen.

## Datos de ejemplo y pruebas en el navegador

- `python manage.py seed_demo` crea "Familia Demo" con `admin@demo.test`,
  `editor@demo.test` y `lector@demo.test`. La contraseña es `DEMO_PASSWORD` de
  `backend/.env`. Solo funciona con `DEBUG=True`.
- El usuario tiene su familia real en la base de desarrollo y suele tener la
  sesión abierta en `localhost:5183`. **No hagas `flush` ni borres datos, y no
  pruebes con su familia.** Para probar en el navegador sin cerrarle la sesión,
  levanta una segunda instancia en `127.0.0.1` (otra cookie) y entra con la
  familia de ejemplo:

  ```bash
  FRONTEND_ORIGIN=http://127.0.0.1:5184 python manage.py runserver 127.0.0.1:8011
  VITE_API_URL=http://127.0.0.1:8011/api npx vite --port 5184 --host 127.0.0.1
  ```

## Skills a usar

| Skill | Cuándo |
|---|---|
| `grill-me` | Para cuestionar una spec antes de aprobarla |
| `ui-ux-pro-max` | Al diseñar o revisar cualquier pantalla o componente |
| `dataviz` | Antes de escribir cualquier gráfico o el dashboard |
| `run` | Para levantar la aplicación y comprobar un cambio |
| `code-review` y `simplify` | Al terminar la implementación de una spec |
| `security-review` | Antes de cerrar cada spec |

## Hoja de ruta

| Spec | Contenido | Estado |
|---|---|---|
| 001 | Fundaciones: estructura, Postgres, esqueleto Django y React, `.env`, rate limit, base de animaciones | Implementada |
| 002 | Autenticación, familia y roles | Implementada |
| 003 | Catálogos parametrizados | Implementada |
| 004 | Registro de ingresos y gastos | Pendiente |
| 005 | Tasas BCV y vista en USD, bolívares y euros | Pendiente |
| 006 | Dashboard interactivo | Pendiente |
| 007 | Comparación contra meses anteriores | Pendiente |
| 008 | Exportación a CSV y dashboard a PDF | Pendiente |

Actualiza la columna "Estado" al escribir, aprobar e implementar cada spec.

## Comandos

Puertos: frontend 5183, backend 8010, Postgres 5434. Los puertos 5173, 8000,
5432 y 5433 los usan otros proyectos de esta máquina: no usarlos.

```powershell
docker compose up -d                          # base de datos
cd backend; .venv\Scripts\activate
python manage.py runserver 8010               # backend
python manage.py test                         # pruebas del backend
python manage.py makemigrations; python manage.py migrate
cd frontend; npm run dev                      # frontend
npm run build                                 # comprobar que compila
```

- En Windows, Python se invoca con `py` fuera del entorno virtual (`py -m venv .venv`).
- `POSTGRES_HOST` debe ser `127.0.0.1`, no `localhost`: con `localhost` cada
  consulta tarda unos 3 segundos porque Windows prueba antes IPv6.
- Al probar animaciones con el navegador automatizado, la ventana debe estar
  visible; si no, Chrome frena las animaciones y parecen lentas.
