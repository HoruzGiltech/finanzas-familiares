import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef } from "react";

import { backdrop, modalPanel } from "../lib/motion.js";

// Ventana sobre la página. Para que se anime al cerrarse, quien la usa debe
// envolverla así:  <AnimatePresence>{open && <Modal ... />}</AnimatePresence>
export default function Modal({ title, onClose, children }) {
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    // Al abrir, el foco entra en el modal; al cerrar, vuelve a donde estaba.
    const previousFocus = document.activeElement;
    // Primero un campo para escribir; si no hay, el primer botón.
    const panel = panelRef.current;
    const firstControl = panel.querySelector("input, select") ?? panel.querySelector("button");
    firstControl?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
    // [] = solo al abrir y al cerrar el modal.
  }, []);

  return (
    <motion.div
      {...backdrop}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
    >
      <motion.div
        {...modalPanel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Un clic dentro de la ventana no debe cerrarla.
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
