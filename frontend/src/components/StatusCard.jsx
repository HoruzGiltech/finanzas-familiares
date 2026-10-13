import { motion } from "motion/react";

import { duration, slideUp } from "../lib/motion.js";

// Tarjeta que muestra si un servicio funciona (ok = true) o no (ok = false).
export default function StatusCard({ title, ok }) {
  return (
    <motion.div
      variants={slideUp}
      whileHover={{ y: -2, transition: { duration: duration.fast } }}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
        <span
          aria-hidden="true"
          className={`h-3 w-3 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
        />
        {ok ? "Funcionando" : "Con problemas"}
      </p>
    </motion.div>
  );
}
