import { motion } from "motion/react";

import { slideUp } from "../lib/motion.js";
import Card from "./Card.jsx";
import StatNumber from "./StatNumber.jsx";

// Un total del mes (Ingresos, Gastos o Balance) con su cifra que cuenta.
// En el móvil es una fila (etiqueta a la izquierda, cifra a la derecha) para que
// quepan cifras largas en bolívares; desde 640 px, una tarjeta.
// `detail` es una línea opcional debajo: el cambio frente al mes anterior (spec 007).
export default function TotalCard({ icon: Icon, label, value, format, tone = "", detail }) {
  return (
    <motion.div variants={slideUp}>
      <Card className="h-full px-4 py-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 sm:block">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon aria-hidden="true" className={`h-4 w-4 ${tone}`} />
            {label}
          </p>
          <p className={`text-lg font-semibold whitespace-nowrap sm:mt-1 ${tone}`}>
            <StatNumber value={value} format={format} />
          </p>
        </div>
        {detail && <p className="mt-1 text-right text-xs sm:text-left">{detail}</p>}
      </Card>
    </motion.div>
  );
}
