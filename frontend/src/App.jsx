import { AnimatePresence, motion } from "motion/react";
import { Navigate, Route, Routes, useLocation } from "react-router";

import { useAuth } from "./auth/AuthContext.jsx";
import Header from "./components/Header.jsx";
import Skeleton from "./components/Skeleton.jsx";
import { pageTransition } from "./lib/motion.js";
import Budget from "./pages/Budget.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Members from "./pages/Members.jsx";
import Movements from "./pages/Movements.jsx";
import Register from "./pages/Register.jsx";
import Settings from "./pages/Settings.jsx";

// Pantallas que exigen sesión. El frontend solo redirige: quien decide de
// verdad si algo está permitido es siempre la API.
function Private({ adminOnly = false, children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/entrar" replace />;
  }
  // Con una contraseña temporal, lo único disponible es cambiarla.
  if (user.must_change_password && location.pathname !== "/cambiar-clave") {
    return <Navigate to="/cambiar-clave" replace />;
  }
  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

// Pantallas solo para quien no ha entrado (entrar y registro).
function PublicOnly({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  const { user } = useAuth();
  const location = useLocation();

  // Todavía no sabemos si hay sesión: mostramos un esqueleto en vez de un parpadeo.
  if (user === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8" aria-label="Cargando">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {user && <Header />}

      {/* pb-24 en móvil: deja sitio para la barra de navegación inferior. */}
      <main
        className={`mx-auto max-w-4xl px-4 py-6 print:max-w-none print:p-0 ${user ? "pb-24 sm:pb-6" : ""}`}
      >
        {/* mode="wait": la página que sale termina antes de que entre la nueva. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <Routes location={location}>
              <Route
                path="/entrar"
                element={
                  <PublicOnly>
                    <Login />
                  </PublicOnly>
                }
              />
              <Route
                path="/registro"
                element={
                  <PublicOnly>
                    <Register />
                  </PublicOnly>
                }
              />
              <Route
                path="/"
                element={
                  <Private>
                    <Home />
                  </Private>
                }
              />
              <Route
                path="/movimientos"
                element={
                  <Private>
                    <Movements />
                  </Private>
                }
              />
              <Route
                path="/presupuesto"
                element={
                  <Private>
                    <Budget />
                  </Private>
                }
              />
              <Route
                path="/cambiar-clave"
                element={
                  <Private>
                    <ChangePassword />
                  </Private>
                }
              />
              <Route
                path="/miembros"
                element={
                  <Private adminOnly>
                    <Members />
                  </Private>
                }
              />
              <Route
                path="/configuracion"
                element={
                  <Private adminOnly>
                    <Settings />
                  </Private>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
