import { motion } from "motion/react";

import { slideUp } from "../lib/motion.js";
import Card from "./Card.jsx";
import StatNumber from "./StatNumber.jsx";

// Un total del mes (Ingresos, Gastos o Balance) con su cifra que cuenta.
// En el móvil es una fila (etiqueta a la izquierda, cifra a la derecha) para que
// quepan cifras largas en bolívares; desde 640 px, una tarjeta.
export default function TotalCard({ icon: Icon, label, value, format, tone = "" }) {
  return (
    <motion.div variants={slideUp}>
      <Card className="flex h-full items-center justify-between gap-3 px-4 py-3 sm:block sm:p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon aria-hidden="true" className={`h-4 w-4 ${tone}`} />
          {label}
        </p>
        <p className={`text-lg font-semibold whitespace-nowrap sm:mt-1 ${tone}`}>
          <StatNumber value={value} format={format} />
        </p>
      </Card>
    </motion.div>
  );
}
