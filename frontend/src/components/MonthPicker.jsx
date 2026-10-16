import { ChevronLeft, ChevronRight } from "lucide-react";

import { currentMonth, formatMonth, shiftMonth } from "../lib/format.js";
import IconButton from "./IconButton.jsx";

// Flechas para ir al mes anterior y al siguiente. No deja pasar de `max` (el mes actual,
// salvo en Presupuesto, que deja planificar el siguiente).
export default function MonthPicker({ month, onChange, max = currentMonth() }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-1">
      <IconButton
        icon={ChevronLeft}
        label="Mes anterior"
        onClick={() => onChange(shiftMonth(month, -1))}
      />
      {/* aria-live: el lector de pantalla anuncia el mes al cambiarlo. */}
      <p aria-live="polite" className="font-semibold">
        {formatMonth(month)}
      </p>
      <IconButton
        icon={ChevronRight}
        label="Mes siguiente"
        disabled={month >= max}
        onClick={() => onChange(shiftMonth(month, 1))}
      />
    </div>
  );
}
