// Los roles los define el backend. Aquí solo están sus textos para la interfaz.
export const ROLES = [
  {
    value: "admin",
    label: "Administrador",
    description: "Ve todo, registra movimientos y gestiona a los miembros.",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Ve todo y registra movimientos.",
  },
  {
    value: "viewer",
    label: "Lector",
    description: "Solo puede ver.",
  },
];

export function getRole(value) {
  return ROLES.find((role) => role.value === value) ?? ROLES[2];
}
