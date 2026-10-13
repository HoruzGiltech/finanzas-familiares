import { LoaderCircle } from "lucide-react";
import { motion } from "motion/react";

import { press } from "../lib/motion.js";

const VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border bg-card text-foreground hover:bg-muted",
  danger: "border border-danger/30 bg-card text-danger hover:bg-danger-soft",
};

// Botón de la aplicación. Con loading={true} muestra un indicador y no se puede pulsar.
export default function Button({
  variant = "primary",
  loading = false,
  disabled = false,
  icon: Icon,
  className = "",
  children,
  ...props
}) {
  return (
    <motion.button
      type="button"
      whileTap={press}
      disabled={disabled || loading}
      aria-busy={loading}
      className={
        // min-h-11 = 44 px: tamaño mínimo cómodo para el dedo.
        "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg " +
        "px-4 text-sm font-semibold transition-colors duration-150 " +
        "disabled:cursor-not-allowed disabled:opacity-60 " +
        `${VARIANTS[variant]} ${className}`
      }
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
      ) : (
        Icon && <Icon aria-hidden="true" className="h-4 w-4" />
      )}
      {children}
    </motion.button>
  );
}
