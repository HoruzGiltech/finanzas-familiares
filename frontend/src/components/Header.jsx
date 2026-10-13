import { House, KeyRound, LogOut, Users, Wallet } from "lucide-react";
import { NavLink } from "react-router";

import { useAuth } from "../auth/AuthContext.jsx";
import { getRole } from "../lib/roles.js";

function navLinkClass({ isActive }) {
  const base =
    "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium " +
    "transition-colors duration-150";
  return isActive
    ? `${base} bg-primary-soft text-primary`
    : `${base} text-muted-foreground hover:bg-muted`;
}

// Barra superior: navegación, quién está conectado y cerrar sesión.
export default function Header() {
  const { user, logout } = useAuth();
  // Con una contraseña temporal solo se puede cambiar la contraseña o salir.
  const canNavigate = !user.must_change_password;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
        <span className="flex items-center gap-2 text-lg font-semibold text-primary">
          <Wallet aria-hidden="true" className="h-5 w-5" />
          Finanzas Familiares
        </span>

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{getRole(user.role).label}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>

        {canNavigate && (
          <nav aria-label="Principal" className="flex w-full gap-1">
            <NavLink to="/" end className={navLinkClass}>
              <House aria-hidden="true" className="h-4 w-4" />
              Inicio
            </NavLink>
            {user.role === "admin" && (
              <NavLink to="/miembros" className={navLinkClass}>
                <Users aria-hidden="true" className="h-4 w-4" />
                Miembros
              </NavLink>
            )}
            <NavLink to="/cambiar-clave" className={navLinkClass}>
              <KeyRound aria-hidden="true" className="h-4 w-4" />
              Contraseña
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  );
}
