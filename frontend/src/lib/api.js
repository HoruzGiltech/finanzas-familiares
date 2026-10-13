// Único punto de entrada al backend. Todas las pantallas llaman a la API desde aquí.

const API_URL = import.meta.env.VITE_API_URL;

// Token de seguridad que Django exige en cada POST o PATCH.
let csrfToken = null;

async function send(path, options = {}) {
  try {
    return await fetch(`${API_URL}${path}`, {
      credentials: "include", // envía la cookie de sesión
      ...options,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. ¿Está encendido?");
  }
}

async function getCsrfToken() {
  if (!csrfToken) {
    const response = await send("/auth/csrf/");
    csrfToken = (await response.json()).csrfToken;
  }
  return csrfToken;
}

// Devuelve { ok, status, data }. Solo lanza un Error (con mensaje en español)
// cuando no se puede hablar con el servidor o este pide esperar.
async function request(method, path, body) {
  const options = { method, headers: {} };

  if (method !== "GET") {
    options.headers["X-CSRFToken"] = await getCsrfToken();
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body ?? {});
  }

  const response = await send(path, options);

  // Django cambia el token al iniciar o cerrar sesión: pedimos uno nuevo la próxima vez.
  if (path.startsWith("/auth/")) {
    csrfToken = null;
  }

  if (response.status === 429) {
    throw new Error("Demasiados intentos. Espera un minuto e inténtalo de nuevo.");
  }

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      throw new Error("El servidor respondió algo inesperado.");
    }
  }

  return { ok: response.ok, status: response.status, data };
}

export const apiGet = (path) => request("GET", path);
export const apiPost = (path, body) => request("POST", path, body);
export const apiPatch = (path, body) => request("PATCH", path, body);

// Convierte la respuesta de error de la API en algo cómodo para un formulario:
//   { fields: { email: "Ya existe..." }, general: "Mensaje que no es de un campo" }
export function readErrors(data) {
  const fields = {};
  let general = "";

  for (const [key, value] of Object.entries(data ?? {})) {
    const message = Array.isArray(value) ? value.join(" ") : String(value);
    if (key === "detail" || key === "non_field_errors") {
      general = message;
    } else {
      fields[key] = message;
    }
  }

  return { fields, general };
}
