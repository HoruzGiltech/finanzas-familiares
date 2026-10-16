import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Link } from "react-router";

import { formatMoney } from "../lib/format.js";

const MOST_UP = 5; // cuántas subidas se muestran
const MOST_DOWN = 3; // cuántas bajadas

// "+$51,35 (+43 %)", o "nueva" si antes no había gasto.
function changeText(item, symbol) {
  const sign = Number(item.change) > 0 ? "+" : "";
  const money = formatMoney(item.change, symbol, sign);
  if (item.change_percent === null) return `${money} (nueva)`;
  return `${money} (${sign}${Math.round(Number(item.change_percent))} %)`;
}

function ChangeRow({ item, symbol, up, month }) {
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <li>
      <Link
        to={`/movimientos?mes=${month}&categoria=${item.id}`}
        className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/60"
      >
        <span className="min-w-0 flex-1">
          {/* En el móvil: nombre y monto arriba, el cambio debajo. */}
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium" title={item.name}>
              {item.name}
            </span>
            <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
              {formatMoney(item.amount, symbol)}
            </span>
          </span>
          <span
            className={`mt-0.5 flex items-center gap-1 text-sm tabular-nums ${up ? "text-danger" : "text-accent-strong"}`}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">{up ? "Subió" : "Bajó"} </span>
            {changeText(item, symbol)}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground print:hidden"
        />
      </Link>
    </li>
  );
}

// "Qué cambió" (spec 007): las categorías de gasto que más subieron y bajaron
// frente al promedio de los meses anteriores. `categories` viene ordenada de la
// que más subió a la que más bajó. Más gasto es malo: subir va en rojo.
export default function CategoryChanges({ categories, partialUntil, month, symbol }) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay meses anteriores para comparar.
      </p>
    );
  }
  const up = categories.filter((item) => Number(item.change) > 0).slice(0, MOST_UP);
  const down = categories
    .filter((item) => Number(item.change) < 0)
    .slice(-MOST_DOWN)
    .reverse();

  return (
    <div>
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        Frente al promedio de los meses anteriores (hasta 3)
        {partialUntil ? `, del 1 al ${partialUntil} de cada mes` : ""}.
      </p>
      {up.length === 0 && down.length === 0 && (
        <p className="text-sm text-muted-foreground">Ninguna categoría cambió.</p>
      )}
      {up.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Subieron</h3>
          <ul className="mt-1 divide-y divide-border">
            {up.map((item) => (
              <ChangeRow key={item.id} item={item} symbol={symbol} up month={month} />
            ))}
          </ul>
        </>
      )}
      {down.length > 0 && (
        <>
          <h3 className={`text-sm font-semibold ${up.length > 0 ? "mt-4" : ""}`}>Bajaron</h3>
          <ul className="mt-1 divide-y divide-border">
            {down.map((item) => (
              <ChangeRow key={item.id} item={item} symbol={symbol} up={false} month={month} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
