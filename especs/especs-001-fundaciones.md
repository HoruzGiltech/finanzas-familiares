# Spec 001 — Fundaciones del proyecto

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Nada |
| **Desbloquea** | Todas las demás specs |

## 1. Objetivo

Dejar el proyecto listo para construir encima: backend, frontend y base de datos
conectados entre sí, con la seguridad básica y la base de animaciones ya puestas.

Al terminar esta spec no hay ninguna funcionalidad de finanzas todavía. Lo que
hay es una pantalla de prueba que demuestra que las tres piezas se hablan.

## 2. Alcance

### 2.1 Repositorio

- `git init` con rama `main`.
- `.gitignore` que excluya `.env`, entornos virtuales, `node_modules`, archivos
  compilados y carpetas de editor.
- `README.md` con los pasos para levantar el proyecto desde cero.

### 2.2 Base de datos

- PostgreSQL levantado con `docker-compose.yml` en la raíz.
- Usuario, contraseña, nombre de la base y puerto leídos desde `.env`.
- Los datos persisten en un volumen de Docker (no se pierden al reiniciar).
- Postgres se publica en el puerto **5434** de la máquina. Los puertos 5432 y
  5433 no se usan, para no chocar con otros Postgres ya instalados. Dentro del
  contenedor sigue escuchando en el 5432; solo cambia el puerto de la máquina.

### 2.3 Backend (`backend/`)

- Proyecto Django con Django REST Framework.
- Entorno virtual de Python y `requirements.txt`.
- Configuración leída desde `.env`: `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`,
  datos de conexión a Postgres y orígenes permitidos del frontend.
- Conexión a Postgres funcionando y migraciones iniciales aplicadas.
- CORS y CSRF configurados para aceptar solo el origen del frontend.
- Una app `core` con el endpoint de salud:

  ```
  GET /api/health/
  200 → { "status": "ok", "database": "ok" }
  503 → { "status": "error", "database": "error" }   (si Postgres no responde)
  ```

### 2.4 Rate limit

Con el throttling de Django REST Framework. Los límites se leen desde `.env`
para poder ajustarlos sin tocar código.

| Ámbito | Límite por defecto | Se aplica en |
|---|---|---|
| Anónimo (por IP) | 60 peticiones/minuto | Toda la API |
| Usuario autenticado | 300 peticiones/minuto | Toda la API |
| `login` | 5 peticiones/minuto | Queda definido aquí; se conecta al login en la spec 002 |

Al superar el límite la API responde `429 Too Many Requests`.

### 2.5 Frontend (`frontend/`)

- React con Vite, en JavaScript.
- React Router para las rutas.
- Tailwind CSS para los estilos.
- URL de la API leída desde `.env` (`VITE_API_URL`).
- Un cliente de API en un solo archivo (`src/lib/api.js`) que todas las
  pantallas usarán para llamar al backend.
- Dos rutas de prueba:
  - `/` — pantalla de inicio que llama a `/api/health/` y muestra el estado
    de la API y de la base de datos.
  - `/acerca` — pantalla sencilla, solo para poder probar la transición
    entre páginas.

### 2.6 Base de animaciones

- Librería Motion instalada.
- `src/lib/motion.js` con las duraciones y curvas del proyecto (rápida 150 ms,
  normal 220 ms, lenta 300 ms) y las variantes reutilizables: aparecer,
  deslizar hacia arriba y entrada escalonada de una lista.
- Transición animada al cambiar entre `/` y `/acerca`.
- Entrada escalonada de las tarjetas de estado en la pantalla de inicio.
- Esqueleto animado mientras se espera la respuesta de `/api/health/`.
- Con "reducir movimiento" activado en el sistema, las animaciones se
  desactivan y el contenido aparece directamente.

### 2.7 Variables de entorno

Un `.env.example` por carpeta, con valores de ejemplo falsos.

**`backend/.env.example`**

```
SECRET_KEY=cambia-esto-por-una-clave-larga-y-aleatoria
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
FRONTEND_ORIGIN=http://localhost:5183

POSTGRES_DB=finanzas
POSTGRES_USER=finanzas
POSTGRES_PASSWORD=cambia-esta-clave
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5434

THROTTLE_ANON=60/min
THROTTLE_USER=300/min
THROTTLE_LOGIN=5/min
```

**`frontend/.env.example`**

```
VITE_API_URL=http://localhost:8010/api
```

`docker-compose.yml` lee las variables `POSTGRES_*` del mismo `backend/.env`,
para no repetir la contraseña en dos sitios.

## 3. Fuera de alcance

- Usuarios, login, familia y roles (spec 002).
- Cualquier modelo de datos de finanzas (specs 003 y 004).
- Diseño visual definitivo: colores, tipografía y componentes se definen con
  `ui-ux-pro-max` cuando haya pantallas reales (spec 002 en adelante).
- Despliegue a producción, HTTPS y dominio.
- Integración continua.

## 4. Estructura resultante

```
finanzas-familiares/
├── .gitignore
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── especs/
├── backend/
│   ├── .env.example
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/            settings, urls, wsgi
│   └── core/              endpoint de salud y sus pruebas
└── frontend/
    ├── .env.example
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx        rutas y transición de página
        ├── lib/
        │   ├── api.js
        │   └── motion.js
        ├── pages/
        │   ├── Home.jsx
        │   └── About.jsx
        └── components/
            ├── StatusCard.jsx
            └── Skeleton.jsx
```

## 5. Criterios de aceptación

Cada uno debe poder comprobarse.

1. `docker compose up -d` levanta Postgres sin errores y lo publica en el
   puerto 5434 (ni 5432 ni 5433).
2. `python manage.py migrate` aplica las migraciones contra ese Postgres.
3. `GET /api/health/` responde `200` con `status` y `database` en `ok`.
4. Con Postgres detenido, `GET /api/health/` responde `503`.
5. Al hacer más de 60 peticiones en un minuto sin autenticar, la API responde `429`.
6. `npm run dev` levanta el frontend y la pantalla de inicio muestra el estado
   de la API y de la base de datos en verde.
7. Con el backend apagado, la pantalla de inicio muestra un error claro en
   español, no una pantalla en blanco.
8. Al navegar entre `/` y `/acerca` se ve una transición animada.
9. Mientras carga el estado se ve un esqueleto animado.
10. Con "reducir movimiento" activado en el sistema, no hay animaciones.
11. `git status` no muestra ningún `.env`, y buscar `SECRET_KEY` o la contraseña
    de Postgres en los archivos versionados no devuelve valores reales.
12. Una petición desde un origen distinto al configurado es rechazada por CORS.
13. Las pruebas automáticas del backend pasan: salud en `200`, salud en `503`
    y rate limit en `429`.

## 6. Cómo probar

```
# 1. Base de datos
docker compose up -d

# 2. Backend
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # y cambiar SECRET_KEY y la contraseña
python manage.py migrate
python manage.py test
python manage.py runserver 8010

# 3. Frontend (en otra terminal)
cd frontend
npm install
copy .env.example .env
npm run dev
```

Abrir `http://localhost:5183` y comprobar los criterios 6 a 10.

## 7. Requisitos previos en la máquina

- Python 3.12 o superior.
- Node.js 20 o superior.
- Docker Desktop.
- Git.

## 8. Decisiones a revisar

1. **JavaScript en vez de TypeScript** en el frontend. Es más fácil de leer para
   quien empieza; TypeScript detecta más errores, pero añade conceptos. Se puede
   migrar después.
2. **Tailwind CSS** para los estilos. Es con lo que mejor trabaja `ui-ux-pro-max`
   y evita mantener archivos CSS aparte.
3. **Docker solo para Postgres.** Django y React corren directo en la máquina,
   que es más simple de depurar. Si no hay Docker Desktop, se usa un Postgres
   instalado en Windows y cambia solo el paso 1.
4. **El rate limit guarda sus contadores en la memoria de Django.** Sirve para
   desarrollo y para un solo servidor. Al desplegar con varios procesos hará
   falta un almacén compartido (Redis); se tratará en la spec de despliegue.
5. **Pruebas automáticas solo en el backend** en esta spec. Las del frontend
   empiezan cuando haya lógica real que probar.
