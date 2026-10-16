import {
  ArrowLeftRight,
  ClipboardList,
  House,
  KeyRound,
  LogOut,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { NavLink } from "react-router";

import { useAuth } from "../auth/AuthContext.jsx";
import { getRole } from "../lib/roles.js";

// En móvil cada enlace es una columna (icono sobre texto) de la barra inferior;
// desde 640 px (sm) es una fila normal bajo el encabezado.
function navLinkClass({ isActive }) {
  const base =
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 " +
    "text-xs font-medium transition-colors duration-150 " +
    "sm:min-h-11 sm:flex-none sm:flex-row sm:gap-2 sm:px-3 sm:text-sm";
  return isActive
    ? `${base} text-primary sm:bg-primary-soft`
    : `${base} text-muted-foreground hover:bg-muted`;
}

// Barra superior (quién está conectado y cerrar sesión) y navegación.
export default function Header() {
  const { user, logout } = useAuth();
  // Con una contraseña temporal solo se puede cambiar la contraseña o salir.
  const canNavigate = !user.must_change_password;
  const isAdmin = user.role === "admin";

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
          {/* En móvil "Contraseña" vive aquí arriba, como icono: en la barra
              inferior no caben cinco enlaces con su texto. */}
          {canNavigate && (
            <NavLink
              to="/cambiar-clave"
              aria-label="Cambiar contraseña"
              className={({ isActive }) =>
                "inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors " +
                "duration-150 hover:bg-muted sm:hidden " +
                (isActive ? "text-primary" : "text-muted-foreground")
              }
            >
              <KeyRound aria-hidden="true" className="h-4 w-4" />
            </NavLink>
          )}
          <button
            type="button"
            onClick={logout}
            aria-label="Cerrar sesión"
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {/* En móvil solo el icono, para que quepa junto al nombre de la aplicación. */}
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>

        {canNavigate && (
          <nav
            aria-label="Principal"
            className={
              // Móvil: barra fija abajo, al alcance del pulgar.
              "fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card px-2 " +
              "pb-[env(safe-area-inset-bottom)] " +
              // Escritorio: fila normal dentro del encabezado.
              "sm:static sm:z-auto sm:w-full sm:gap-1 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0"
            }
          >
            <NavLink to="/" end className={navLinkClass}>
              <House aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
              Inicio
            </NavLink>
            <NavLink to="/movimientos" className={navLinkClass}>
              <ArrowLeftRight aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
              Movimientos
            </NavLink>
            <NavLink to="/presupuesto" className={navLinkClass}>
              <ClipboardList aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
              Presupuesto
            </NavLink>
            {/* En móvil no caben cinco enlaces: Miembros está dentro de Configuración. */}
            {isAdmin && (
              <NavLink to="/miembros" className={(state) => `${navLinkClass(state)} max-sm:hidden`}>
                <Users aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
                Miembros
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/configuracion" className={navLinkClass}>
                <Settings aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
                Configuración
              </NavLink>
            )}
            {/* Solo en escritorio; en móvil está en la barra superior. */}
            <NavLink
              to="/cambiar-clave"
              className={(state) => `${navLinkClass(state)} max-sm:hidden`}
            >
              <KeyRound aria-hidden="true" className="h-5 w-5 sm:h-4 sm:w-4" />
              Contraseña
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  );
}
