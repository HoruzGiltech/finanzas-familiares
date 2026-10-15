import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";

import { fadeIn } from "../lib/motion.js";

const KINDS = {
  error: { icon: CircleAlert, style: "border-danger/30 bg-danger-soft text-red-900" },
  success: { icon: CircleCheck, style: "border-accent/30 bg-accent-soft text-emerald-900" },
  info: { icon: Info, style: "border-primary/20 bg-primary-soft text-blue-950" },
  warning: { icon: TriangleAlert, style: "border-warning/30 bg-warning-soft text-amber-950" },
};

// Aviso. El icono acompaña al color para no depender solo de él.
export default function Alert({ kind = "error", className = "", children }) {
  const { icon: Icon, style } = KINDS[kind];

  return (
    <motion.div
      role={kind === "error" ? "alert" : "status"}
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${style} ${className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </motion.div>
  );
}
