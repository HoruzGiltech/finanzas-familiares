import { Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

import { formatDay, formatMoney } from "../lib/format.js";
import { layoutTransition, listItem } from "../lib/motion.js";
import IconButton from "./IconButton.jsx";

// Convierte la lista (ya ordenada por fecha) en renglones: antes del primer
// movimiento de cada día se intercala un renglón con la fecha.
function withDayHeaders(movements) {
  const rows = [];
  let lastDate = null;
  for (const movement of movements) {
    if (movement.date !== lastDate) {
      rows.push({ key: `day-${movement.date}`, date: movement.date });
      lastDate = movement.date;
    }
    rows.push({ key: `movement-${movement.id}`, movement });
  }
  return rows;
}

// Movimientos agrupados por día. Los botones de corregir y borrar solo salen
// en los que la API marca con can_edit. Los montos vienen ya en `currency`.
export default function MovementList({ movements, currency, symbols, onEdit, onDelete }) {
  // Solo al aparecer la lista los renglones entran uno detrás de otro; los que
  // se añadan después entran sin espera.
  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  return (
    // relative: lo necesita popLayout para sacar de su sitio el renglón que se va.
    <ul className="relative">
      <AnimatePresence mode="popLayout">
        {withDayHeaders(movements).map((row, index) => (
          <motion.li
            key={row.key}
            layout
            variants={listItem}
            custom={firstRender.current ? index : 0}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={layoutTransition}
          >
            {row.movement ? (
              <MovementRow
                movement={row.movement}
                currency={currency}
                symbols={symbols}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : (
              <h2 className="pt-5 pb-1 text-sm font-semibold text-muted-foreground">
                {formatDay(row.date)}
              </h2>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function MovementRow({ movement, currency, symbols, onEdit, onDelete }) {
  const symbol = symbols[currency];
  const isIncome = movement.movement_type === "income";
  const Icon = isIncome ? TrendingUp : TrendingDown;
  const detail = `${movement.payment_method.name} · ${movement.created_by.full_name}`;

  return (
    <div className="flex items-start gap-3 border-b border-border py-3">
      <span
        className={
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
          (isIncome ? "bg-accent-soft text-accent-strong" : "bg-muted text-muted-foreground")
        }
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{movement.category.name}</p>
        {movement.description && (
          <p className="text-sm break-words text-muted-foreground">{movement.description}</p>
        )}
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>

      {/* En móvil los botones van bajo el monto; desde 640 px, a su lado. */}
      <div className="flex flex-col items-end sm:flex-row sm:items-center sm:gap-2">
        <div className="text-right">
          {/* El signo acompaña al color: + ingreso, − gasto. */}
          <p className={`font-semibold whitespace-nowrap ${isIncome ? "text-accent-strong" : ""}`}>
            <span className="sr-only">{isIncome ? "Ingreso de " : "Gasto de "}</span>
            {formatMoney(movement.amount, symbol, isIncome ? "+" : "−")}
          </p>
          {/* Se recuerda lo que se escribió si fue en otra moneda, o si al pasar por
              el dólar (guardado con dos decimales) el monto ya no coincide. */}
          {(movement.original_currency !== currency ||
            movement.original_amount !== movement.amount) && (
            <p className="text-xs whitespace-nowrap text-muted-foreground">
              Anotado:{" "}
              {formatMoney(
                movement.original_amount,
                symbols[movement.original_currency] ?? movement.original_currency,
              )}
            </p>
          )}
        </div>
        {movement.can_edit && (
          <div className="flex justify-end">
            <IconButton
              icon={Pencil}
              label={`Corregir ${movement.category.name} de ${formatMoney(movement.amount, symbol)}`}
              onClick={() => onEdit(movement)}
            />
            <IconButton
              icon={Trash2}
              danger
              label={`Borrar ${movement.category.name} de ${formatMoney(movement.amount, symbol)}`}
              onClick={() => onDelete(movement)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
