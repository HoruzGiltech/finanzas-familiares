import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";

import { formatMoney, formatPercent } from "../lib/format.js";
import { duration, ease, staggerDelay } from "../lib/motion.js";

const MAX_ROWS = 8; // si hay más, las más pequeñas se juntan en "Resto"

// Junta en una sola fila todo lo que no cabe. `items` viene de mayor a menor.
function withRest(items, noun) {
  if (items.length <= MAX_ROWS) return items;
  const kept = items.slice(0, MAX_ROWS - 1);
  const rest = items.slice(MAX_ROWS - 1);
  // En céntimos enteros, para que la suma no arrastre errores de decimales.
  const cents = rest.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  const percent = rest.reduce((sum, item) => sum + Number(item.percent), 0);
  return [
    ...kept,
    {
      id: "rest",
      name: `Resto (${rest.length} ${noun})`,
      amount: cents / 100,
      percent: percent.toFixed(1),
    },
  ];
}

// Barras horizontales de mayor a menor, con nombre, monto y porcentaje escritos.
// items = [{ id, name, amount, percent }]. Con `linkTo(item)` cada fila es un
// enlace (el "Resto" nunca lo es). La barra más larga es la mayor.
export default function BarList({ items, symbol, noun, linkTo }) {
  const rows = withRest(items, noun);
  const biggest = Math.max(...rows.map((item) => Number(item.amount)));

  return (
    <ul className="space-y-1">
      {rows.map((item, index) => {
        const money = formatMoney(item.amount, symbol);
        const percent = formatPercent(item.percent);
        // Al menos un poco de barra, para que un gasto pequeño no desaparezca.
        const width = Math.max((Number(item.amount) / biggest) * 100, 1);
        const href = linkTo && item.id !== "rest" ? linkTo(item) : null;

        const content = (
          <>
            {/* Nombre y monto encima, porcentaje junto a la barra: así caben las
                cifras largas en bolívares sin cortar el nombre en el móvil. */}
            <span className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium" title={item.name}>
                {item.name}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-semibold whitespace-nowrap tabular-nums">
                {money}
                {href && (
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 text-muted-foreground print:hidden"
                  />
                )}
              </span>
            </span>
            <span className="mt-1 flex items-center gap-3">
              <span aria-hidden="true" className="block h-2 flex-1 rounded-full bg-muted">
                {/* Crece desde la izquierda con scaleX: solo se anima transform. */}
                <motion.span
                  className="block h-full origin-left rounded-full bg-primary"
                  style={{ width: `${width}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: duration.slow, ease, delay: staggerDelay(index) }}
                />
              </span>
              <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {percent}
              </span>
            </span>
          </>
        );

        const rowClass = "-mx-2 block min-h-11 rounded-lg px-2 py-2";
        return (
          <li key={item.id}>
            {href ? (
              <Link
                to={href}
                aria-label={`Ver los movimientos de ${item.name}: ${money}, ${percent} de los gastos`}
                className={`${rowClass} transition-colors duration-150 hover:bg-muted/60`}
              >
                {content}
              </Link>
            ) : (
              <div className={rowClass}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
