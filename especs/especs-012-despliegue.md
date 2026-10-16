# Spec 012 — Despliegue en Vercel y Railway

| | |
|---|---|
| **Estado** | Aprobada |
| **Depende de** | Todas las anteriores |

## 1. Objetivo

Publicar la aplicación en internet:

- **Frontend** (React) en **Vercel**.
- **Backend** (Django) y **PostgreSQL** en **Railway**.

## 2. El problema de las cookies y cómo se resuelve

La sesión es una cookie de Django (`HttpOnly`, `SameSite=Lax`). Si el
navegador habla directamente con dos dominios distintos (`*.vercel.app` y
`*.up.railway.app`), esa cookie es "de otro sitio": el navegador no la envía y
no se podría iniciar sesión. Ponerla en `SameSite=None` tampoco sirve, porque
Safari y cada vez más Chrome bloquean las cookies de terceros.

**Solución**: Vercel hace de intermediario. El navegador solo habla con
`https://<app>.vercel.app`; las rutas `/api/...` las reenvía Vercel a
Railway (una *rewrite*). Para el navegador todo es el mismo sitio: la cookie es
propia, `SameSite=Lax` sigue sirviendo y CORS deja de ser necesario.

```
navegador ──> app.vercel.app ──/api/*──> backend.up.railway.app ──> Postgres
                     └── resto: index.html (React)
```

## 3. Cambios en el repositorio

**Backend**

1. `gunicorn` en `requirements.txt`: el servidor de producción
   (`runserver` es solo para desarrollo).
2. `whitenoise`: sirve los estilos del panel `/admin` con `DEBUG=False`
   (`STATIC_ROOT` y `collectstatic`).
3. `SECURE_PROXY_SSL_HEADER`: Railway recibe HTTPS y se lo pasa a Django por
   HTTP; con esto Django sabe que la petición original era segura.
4. `backend/.python-version` con `3.13`, para que Railway use esa versión.
5. `backend/railway.json`: comando de arranque. Aplica las migraciones y
   arranca gunicorn en el puerto que da Railway.
6. `.env.example` al día con las variables nuevas.

**Frontend**

7. `frontend/vercel.json`:
   - `/api/:path*` se reenvía al backend de Railway.
   - Cualquier otra ruta sirve `index.html`, para que `/presupuesto` funcione
     al recargar.
8. En Vercel, `VITE_API_URL=/api`: misma dirección, sin dominio.

**Tasas del BCV en Linux** (descubierto al desplegar)

9. El servidor del BCV envía un certificado intermedio equivocado. Windows
   descarga solo el bueno, pero Linux no, así que en Railway la consulta al BCV
   fallaba y aparecía "Todavía no hay tasa del BCV". Se guarda ese intermedio
   (Sectigo DV R36, válido hasta 2036) en `rates/certs/` y se verifica con
   `certifi` más ese certificado, igual en Windows y en Linux. Sale
   `truststore`.

No cambia nada más del comportamiento de la aplicación.

## 4. Variables de entorno

**Railway (backend)**

| Variable | Valor |
|---|---|
| `SECRET_KEY` | Clave larga y aleatoria, nueva (no la de desarrollo) |
| `DEBUG` | `False` |
| `ALLOWED_HOSTS` | El dominio de Railway: `<backend>.up.railway.app` |
| `FRONTEND_ORIGIN` | `https://<app>.vercel.app` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | Referencias a las del servicio Postgres de Railway (`${{Postgres.PGDATABASE}}`, etc.) |
| `NUM_PROXIES` | Proxies delante de Django, para que el rate limit vea la IP real. Se comprueba tras el primer despliegue |

`DEMO_PASSWORD` no se pone: `seed_demo` no funciona con `DEBUG=False`.

**Vercel (frontend)**

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `/api` |

## 5. Fuera de alcance

- Dominio propio (se puede añadir después en Vercel).
- Copiar los datos de la base de desarrollo a producción. Producción empieza
  vacía y cada familia se registra. Si se quiere llevar la familia real, se
  hace aparte con `pg_dump` y `pg_restore`.
- Tareas programadas (la tasa del BCV se sigue pidiendo al entrar, como hoy).
- Copias de seguridad automáticas de la base, más allá de lo que da Railway.

## 6. Criterios de aceptación

1. `https://<app>.vercel.app` carga la aplicación, y recargar en
   `/presupuesto` no da 404.
2. Se puede registrar una familia, iniciar sesión, cerrar sesión y volver a
   entrar. La cookie de sesión es del dominio de Vercel, `Secure` y
   `HttpOnly`.
3. Anotar un movimiento, ver Inicio con la tasa del BCV, el presupuesto, y
   exportar el CSV funcionan igual que en desarrollo.
4. `https://<backend>.up.railway.app/admin/` se ve con estilos.
5. Las pruebas del backend siguen pasando en local.

## 7. Decisiones a revisar

1. **Vercel reenvía `/api` a Railway** en vez de que el navegador hable con
   Railway directamente. Es lo que permite mantener la cookie segura
   (`SameSite=Lax`) y no depender de cookies de terceros.
2. **Las migraciones se aplican solas** en cada despliegue, antes de arrancar.
3. **Producción empieza con la base vacía.**
4. **Python 3.13** en producción (en local usas 3.14; Django 6.1 admite las dos).
