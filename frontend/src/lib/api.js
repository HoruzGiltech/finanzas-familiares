// Único punto de entrada al backend. Todas las pantallas llaman a la API desde aquí.

const API_URL = import.meta.env.VITE_API_URL;

// Hace una petición GET y devuelve { status, data }.
// Lanza un Error con un mensaje en español si no se puede hablar con el servidor.
export async function apiGet(path) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: "include", // envía la cookie de sesión
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. ¿Está encendido?");
  }

  if (response.status === 429) {
    throw new Error("Demasiadas peticiones. Espera un minuto e inténtalo de nuevo.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("El servidor respondió algo inesperado.");
  }

  return { status: response.status, data };
}
