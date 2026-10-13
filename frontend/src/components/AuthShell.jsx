import { Wallet } from "lucide-react";
import { motion } from "motion/react";

import { slideUp } from "../lib/motion.js";
import Card from "./Card.jsx";

// Marco de las pantallas sin sesión (entrar y registro): logo, título y una tarjeta.
// `controls` permite a la pantalla sacudir la tarjeta cuando los datos son incorrectos.
export default function AuthShell({ title, subtitle, controls, children }) {
  return (
    <motion.div
      variants={slideUp}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-sm py-6"
    >
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white">
          <Wallet aria-hidden="true" className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </div>

      <motion.div animate={controls}>
        <Card>{children}</Card>
      </motion.div>
    </motion.div>
  );
}
