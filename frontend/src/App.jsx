import { AnimatePresence, motion } from "motion/react";
import { NavLink, Route, Routes, useLocation } from "react-router";

import { pageTransition } from "./lib/motion.js";
import About from "./pages/About.jsx";
import Home from "./pages/Home.jsx";

function navLinkClass({ isActive }) {
  const base =
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";
  return isActive
    ? `${base} bg-emerald-600 text-white`
    : `${base} text-slate-600 hover:bg-slate-200`;
}

export default function App() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold">Finanzas Familiares</span>
          <nav className="flex gap-1">
            <NavLink to="/" className={navLinkClass}>
              Inicio
            </NavLink>
            <NavLink to="/acerca" className={navLinkClass}>
              Acerca
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* mode="wait": la página que sale termina antes de que entre la nueva. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/acerca" element={<About />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
