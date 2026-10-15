// Duraciones, curvas y animaciones reutilizables de toda la aplicación.
// Regla: ningún componente escribe duraciones sueltas; todo sale de aquí.

// Duraciones en segundos (Motion trabaja en segundos, no en milisegundos).
export const duration = {
  fast: 0.15,
  normal: 0.22,
  slow: 0.3,
};

// Curva de salida suave: arranca rápido y frena al final.
export const ease = [0.22, 1, 0.36, 1];

// Aparecer.
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.normal, ease } },
};

// Aparecer subiendo un poco. Sirve para tarjetas y elementos de lista.
export const slideUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } },
};

// Contenedor de una lista: hace que sus hijos entren uno detrás de otro.
export const staggerList = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

// Transición entre páginas. Salir es más rápido que entrar.
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.normal, ease } },
  exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease } },
};

// Fondo oscuro detrás de un modal.
export const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.fast } },
  exit: { opacity: 0, transition: { duration: duration.fast } },
};

// Ventana del modal: aparece creciendo un poco.
export const modalPanel = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: duration.normal, ease } },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: duration.fast, ease } },
};

// Sacudida breve: "esos datos no son correctos".
export const shake = {
  x: [0, -8, 8, -6, 6, 0],
  transition: { duration: duration.slow },
};

// Respuesta al pulsar un botón.
export const press = { scale: 0.97, transition: { duration: duration.fast } };

// Retraso de cada elemento de una lista que entra uno detrás de otro, con tope
// para que una lista larga no haga esperar.
export const staggerDelay = (index) => Math.min(index, 8) * 0.03;

// Renglón de una lista que cambia: el nuevo aparece y el borrado sale hacia un lado.
// Se usa como `variants`, con custom={posición} para que entren uno detrás de otro
// (con tope, para que una lista larga no haga esperar).
export const listItem = {
  initial: { opacity: 0, y: 12 },
  animate: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: duration.slow, ease, delay: staggerDelay(index) },
  }),
  exit: { opacity: 0, x: -16, transition: { duration: duration.fast, ease } },
};

// Movimiento de los demás renglones al ocupar el hueco del que salió.
export const layoutTransition = { layout: { duration: duration.slow, ease } };
