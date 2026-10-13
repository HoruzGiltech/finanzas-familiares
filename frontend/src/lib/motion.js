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
  visible: { transition: { staggerChildren: 0.08 } },
};

// Transición entre páginas.
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.normal, ease } },
  exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease } },
};
