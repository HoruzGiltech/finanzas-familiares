# Spec 002 — Autenticación, familia y roles

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 001 |
| **Desbloquea** | Specs 003 a 008 (todas necesitan saber quién es el usuario y qué puede hacer) |

## 1. Objetivo

Que una persona pueda crear su familia, entrar a la aplicación y decidir qué
puede hacer cada miembro: administrar, registrar movimientos o solo mirar.

Al terminar esta spec todavía no se registran gastos. Lo que hay es registro,
inicio de sesión, gestión de miembros y la base de permisos que usarán las
specs siguientes.

## 2. Conceptos

- **Familia**: el grupo que comparte las finanzas. Todos los datos de la
  aplicación pertenecen a una familia y nunca se ven desde otra.
- **Usuario**: una persona. Entra con su correo y contraseña y pertenece a una
  sola familia.
- **Rol**: lo que el usuario puede hacer dentro de su familia.

| Rol | Ver datos | Registrar movimientos | Gestionar miembros y configuración |
|---|---|---|---|
| Administrador | Sí | Sí | Sí |
| Editor | Sí | Sí | No |
| Lector | Sí | No | No |

Los tres roles son fijos y viven en el código, porque de ellos depende qué
permite la API. No son un catálogo que el usuario edite.

## 3. Alcance

### 3.1 Modelo de datos

**Family**

| Campo | Tipo | Notas |
|---|---|---|
| `name` | texto (100) | Ej.: "Familia Pérez" |
| `created_at` | fecha y hora | Automático |

**User** (modelo de usuario propio de Django; sustituye al que viene por defecto)

| Campo | Tipo | Notas |
|---|---|---|
| `email` | correo, único | Se usa para iniciar sesión. Se guarda en minúsculas |
| `full_name` | texto (150) | |
| `family` | relación a Family | Obligatoria |
| `role` | `admin`, `editor` o `viewer` | |
| `is_active` | sí/no | Un usuario desactivado no puede entrar |
| `must_change_password` | sí/no | Verdadero mientras use una contraseña temporal |
| `password` | hash | Lo gestiona Django; nunca se guarda en texto plano |

Cambiar el modelo de usuario obliga a recrear la base de datos de desarrollo.
No se pierde nada: hoy solo tiene las tablas vacías de la spec 001.

### 3.2 Flujos

**Registro de la cabeza de familia**

1. La persona indica su nombre, correo, contraseña y el nombre de la familia.
2. Se crean la familia y el usuario con rol administrador, en una sola
   operación (si algo falla, no queda nada a medias).
3. Queda con la sesión iniciada.

**Inicio y cierre de sesión**

- Correo y contraseña. Sesión de Django con cookie `HttpOnly`.
- Si los datos son incorrectos, el mensaje es siempre el mismo ("Correo o
  contraseña incorrectos"), sin revelar si el correo existe.
- Un usuario desactivado recibe ese mismo mensaje.

**Alta de un miembro (solo administrador)**

1. El administrador indica nombre, correo y rol.
2. El sistema genera una contraseña temporal y la muestra **una sola vez** en
   pantalla, para que el administrador se la entregue al miembro.
3. En su primer inicio de sesión, el miembro está obligado a cambiarla antes de
   poder usar cualquier otra pantalla.

**Gestión de miembros (solo administrador)**

- Ver la lista de miembros de su familia.
- Cambiar el rol de un miembro.
- Desactivar y reactivar un miembro. No se borran usuarios, para conservar en
  el futuro quién registró cada movimiento.
- Generar una nueva contraseña temporal para un miembro que olvidó la suya.

**Cambio de contraseña propia**

- Cualquier usuario, indicando la actual y la nueva.

### 3.3 Reglas

1. Una familia siempre tiene al menos un administrador activo: el último
   administrador no puede cambiar su propio rol ni desactivarse.
2. Un administrador solo ve y gestiona miembros de su propia familia. Pedir un
   miembro de otra familia responde `404`, como si no existiera.
3. Un correo solo puede pertenecer a un usuario.
4. Las contraseñas pasan los validadores de Django: mínimo 8 caracteres, no
   solo números, no demasiado comunes, no parecidas al correo o al nombre.
5. Los permisos se comprueban siempre en la API. El frontend solo oculta lo que
   el usuario no puede usar.

### 3.4 API

Todas las rutas cuelgan de `/api/`. Las que modifican datos exigen el token CSRF.

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET auth/csrf/` | Cualquiera | Entrega la cookie CSRF al frontend |
| `POST auth/register/` | Cualquiera | Crea familia y administrador; inicia sesión |
| `POST auth/login/` | Cualquiera | Inicia sesión |
| `POST auth/logout/` | Con sesión | Cierra sesión |
| `GET auth/me/` | Con sesión | Devuelve el usuario, su rol y su familia |
| `POST auth/password/` | Con sesión | Cambia la contraseña propia |
| `GET members/` | Administrador | Lista los miembros de la familia |
| `POST members/` | Administrador | Crea un miembro; devuelve la contraseña temporal |
| `PATCH members/{id}/` | Administrador | Cambia rol o estado activo |
| `POST members/{id}/reset-password/` | Administrador | Genera una contraseña temporal nueva |

Respuestas de error: `400` datos inválidos (con el detalle por campo en
español), `401` sin sesión, `403` sin permiso, `404` no existe o es de otra
familia, `429` demasiadas peticiones.

### 3.5 Permisos reutilizables

Tres clases de permiso en `accounts/permissions.py`, que usarán las specs
siguientes:

- `IsFamilyAdmin`: solo administradores.
- `CanEditMovements`: administradores y editores.
- `IsFamilyMember`: cualquier usuario con sesión (lectura).

Mientras `must_change_password` sea verdadero, la API solo permite `auth/me/`,
`auth/password/` y `auth/logout/`.

### 3.6 Seguridad

- **Rate limit**: `auth/login/`, `auth/register/` y
  `members/{id}/reset-password/` usan el ámbito `login` (5 por minuto por IP),
  definido en la spec 001.
- La sesión se renueva al iniciar sesión (lo hace Django) y al cambiar la
  contraseña se cierran las demás sesiones del usuario.
- La contraseña temporal tiene 12 caracteres aleatorios y solo viaja en la
  respuesta que la crea; no se guarda ni se registra en ningún log.
- La sesión caduca a los 14 días sin uso.
- Ninguna respuesta de la API incluye el hash de la contraseña.

### 3.7 Frontend

Pantallas:

| Ruta | Quién | Contenido |
|---|---|---|
| `/entrar` | Sin sesión | Formulario de inicio de sesión |
| `/registro` | Sin sesión | Formulario para crear la familia |
| `/cambiar-clave` | Con sesión | Cambio de contraseña (obligatorio si es temporal) |
| `/` | Con sesión | Inicio: saludo, nombre de la familia y rol. Aquí vivirá el dashboard (spec 006) |
| `/miembros` | Administrador | Lista de miembros, alta, cambio de rol, activar/desactivar, nueva contraseña temporal |

Comportamiento:

- Un `AuthContext` guarda el usuario actual; lo carga con `auth/me/` al abrir
  la aplicación.
- Rutas protegidas: sin sesión se redirige a `/entrar`; un no administrador que
  abre `/miembros` vuelve a `/`.
- `api.js` se amplía con `apiPost` y `apiPatch`, que envían el token CSRF.
- Barra de navegación con el nombre del usuario, su rol y "Cerrar sesión". El
  enlace "Miembros" solo aparece para administradores.
- Formularios con errores por campo en español, botón deshabilitado mientras
  se envía y foco en el primer campo con error.
- Las pantallas de prueba de la spec 001 (`/acerca` y las tarjetas de estado)
  se retiran.

### 3.8 Diseño y animaciones

Esta es la primera spec con pantallas reales, así que aquí se define el
sistema de diseño con la skill `ui-ux-pro-max`: paleta, tipografía, espaciado
y componentes base (botón, campo de formulario, tarjeta, modal, aviso). Se
presenta para aprobación dentro del plan de implementación, antes de programar.

Animaciones, siempre con los valores de `lib/motion.js`:

- Transición entre páginas (ya existe).
- Entrada del formulario de inicio de sesión y de registro.
- Sacudida breve del formulario cuando los datos son incorrectos.
- Entrada escalonada de la lista de miembros; al añadir uno, aparece animado.
- Modal de alta de miembro con entrada y salida.
- Estado de carga en los botones y esqueleto en la lista de miembros.
- Todo respeta "reducir movimiento".

## 4. Fuera de alcance

- Recuperar la contraseña por correo y verificación del correo (requieren un
  servicio de envío de correos; por ahora el administrador genera una temporal).
- Invitaciones por enlace.
- Pertenecer a más de una familia.
- Inicio de sesión con Google u otros, y verificación en dos pasos.
- Eliminar una familia o borrar usuarios definitivamente.
- Registro de actividad (quién hizo qué).

## 5. Criterios de aceptación

**Registro e inicio de sesión**

1. Registrarse crea una familia y un usuario administrador, y deja la sesión iniciada.
2. Registrarse con un correo ya usado o una contraseña débil devuelve `400`
   con el error en español, y no crea ni familia ni usuario.
3. Iniciar sesión con datos correctos funciona; con datos incorrectos, con un
   correo inexistente o con un usuario desactivado devuelve el mismo mensaje.
4. Al sexto intento de inicio de sesión en un minuto la API responde `429`.
5. Cerrar sesión invalida la sesión: `auth/me/` responde `401` después.

**Miembros y roles**

6. El administrador crea un miembro y ve su contraseña temporal una sola vez.
7. El miembro nuevo entra con la temporal y no puede hacer nada más hasta
   cambiarla.
8. Un editor o un lector reciben `403` en todas las rutas de `members/`.
9. Un administrador recibe `404` al pedir o modificar un miembro de otra familia.
10. El último administrador no puede quitarse el rol ni desactivarse (`400`).
11. Un miembro desactivado no puede iniciar sesión, y su sesión abierta deja
    de funcionar.
12. Cambiar la contraseña exige la actual y cierra las demás sesiones.

**Seguridad**

13. Una petición `POST` sin token CSRF es rechazada con `403`.
14. Ninguna respuesta contiene el hash de la contraseña.
15. Sin sesión, todas las rutas salvo `csrf`, `register`, `login` y `health`
    responden `401` o `403`.

**Frontend**

16. Sin sesión, abrir `/` o `/miembros` lleva a `/entrar`.
17. Un no administrador no ve el enlace "Miembros", y abrir `/miembros` a mano
    lo devuelve a `/`.
18. Los formularios muestran los errores por campo en español.
19. Las animaciones de la sección 3.8 funcionan y se desactivan con "reducir
    movimiento".
20. Las pantallas se usan bien en un móvil de 360 px de ancho y con teclado.

**Pruebas**

21. Hay pruebas automáticas del backend para los criterios 1 a 15, y pasan.

## 6. Decisiones a revisar

1. **Los miembros los crea el administrador con una contraseña temporal**, en
   vez de invitarlos por correo. Evita montar un servicio de correos ahora; el
   coste es que el administrador debe entregar la contraseña en persona o por
   mensaje.
2. **Sin recuperación de contraseña por correo.** Si la olvida un miembro, el
   administrador le genera una temporal. Si la olvida el único administrador,
   hay que restablecerla desde la línea de comandos de Django. Se puede añadir
   el correo en una spec posterior.
3. **Roles fijos en el código**, no en un catálogo editable: de ellos depende
   la seguridad de la API.
4. **Un usuario pertenece a una sola familia.**
5. **Los usuarios se desactivan, no se borran.**
6. **Registro abierto**: cualquiera que llegue a la aplicación puede crear una
   familia nueva. Si prefieres que solo exista tu familia, el registro se
   cierra tras crear la primera.
7. **Inicio de sesión con correo**, no con nombre de usuario.
