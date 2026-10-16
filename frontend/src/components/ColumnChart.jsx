import { motion } from "motion/react";
import { useRef, useState } from "react";

import { formatMoney } from "../lib/format.js";
import { duration, ease } from "../lib/motion.js";

// Gráfico de columnas con su tabla. Lo usan "Gastos por día" (spec 006) y
// "Últimos 6 meses" (spec 007).
//
// columns = [{ key, amount (número), text, axis?, axisNote?, disabled? }]
//   text: el detalle que se lee al elegir la columna ("Martes, 13 de octubre: $45,30…").
//   axis: lo que se escribe debajo ("15", "sep"); sin axis, nada.
//   disabled: una columna vacía que no se puede elegir (un día que no ha llegado).
// table = { caption, headers: [{ label, numeric? }], rows: [{ key, cells: [] }] }
//
// El detalle de la columna elegida se queda fijo debajo: en el móvil no hay
// cursor, así que se elige tocando (o con las flechas del teclado).
export default function ColumnChart({ title, label, columns, initial, symbol, table }) {
  const biggest = Math.max(...columns.map((column) => column.amount));
  const peak = columns.findIndex((column) => column.amount === biggest);
  const lastEnabled = columns.findLastIndex((column) => !column.disabled);

  const [selected, setSelected] = useState(initial ?? peak);
  const [asTable, setAsTable] = useState(false);
  const buttons = useRef([]);

  // Flechas, Inicio y Fin mueven la selección (un solo Tab entra al gráfico).
  function handleKey(event) {
    const moves = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: lastEnabled };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.min(Math.max(moves[event.key], 0), lastEnabled);
    setSelected(next);
    buttons.current[next]?.focus();
  }

  // La etiqueta del pico se alinea hacia dentro para no salirse por los bordes.
  const peakOnLeft = peak < columns.length / 2;
  const peakEdge = `${((peakOnLeft ? peak : peak + 1) / columns.length) * 100}%`;
  const hasNotes = columns.some((column) => column.axisNote);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          className="-mr-2 min-h-11 shrink-0 cursor-pointer rounded-lg px-2 text-sm font-semibold whitespace-nowrap text-primary transition-colors duration-150 hover:bg-primary-soft print:hidden"
        >
          {asTable ? "Ver como gráfico" : "Ver como tabla"}
        </button>
      </div>

      {asTable ? (
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{table.caption}</caption>
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              {table.headers.map((header) => (
                <th
                  key={header.label}
                  scope="col"
                  className={`py-2 font-medium ${header.numeric ? "pl-3 text-right" : ""}`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                {row.cells.map((cell, index) => (
                  <td
                    key={table.headers[index].label}
                    className={
                      "py-2 " +
                      (table.headers[index].numeric
                        ? "pl-3 text-right whitespace-nowrap tabular-nums"
                        : "")
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="relative mt-2 pt-6">
            {biggest > 0 && (
              <p
                aria-hidden="true"
                className="absolute top-0 text-xs font-semibold whitespace-nowrap tabular-nums"
                style={peakOnLeft ? { left: peakEdge } : { right: `calc(100% - ${peakEdge})` }}
              >
                {formatMoney(columns[peak].amount, symbol)}
              </p>
            )}

            <div
              role="group"
              aria-label={`${label}. Usa las flechas para cambiar de columna.`}
              onKeyDown={handleKey}
              className="flex h-40 items-end gap-px border-b border-border sm:gap-1"
            >
              {columns.map((column, index) =>
                column.disabled ? (
                  <div key={column.key} className="h-full flex-1" />
                ) : (
                  <button
                    key={column.key}
                    ref={(element) => (buttons.current[index] = element)}
                    type="button"
                    tabIndex={index === selected ? 0 : -1}
                    aria-pressed={index === selected}
                    aria-label={column.text}
                    onClick={() => setSelected(index)}
                    onMouseEnter={() => setSelected(index)}
                    // Toda la altura se puede tocar, no solo la columna.
                    className="flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center rounded-sm focus-visible:outline-offset-0"
                  >
                    <motion.span
                      className={
                        "block w-full max-w-12 origin-bottom rounded-t-[3px] transition-colors duration-150 " +
                        (index === selected ? "bg-primary" : "bg-primary/45")
                      }
                      style={{ height: `${biggest ? (column.amount / biggest) * 100 : 0}%` }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: duration.slow, ease }}
                    />
                  </button>
                ),
              )}
            </div>

            {/* Lo escrito bajo las columnas, centrado bajo cada una. */}
            <div
              aria-hidden="true"
              className={`relative text-xs text-muted-foreground ${hasNotes ? "h-9" : "h-5"}`}
            >
              {columns.map(
                (column, index) =>
                  column.axis && (
                    <span
                      key={column.key}
                      className="absolute top-1 -translate-x-1/2 text-center whitespace-nowrap tabular-nums"
                      style={{ left: `${((index + 0.5) / columns.length) * 100}%` }}
                    >
                      {column.axis}
                      {column.axisNote && (
                        <span className="block text-[11px] leading-tight">{column.axisNote}</span>
                      )}
                    </span>
                  ),
              )}
            </div>
          </div>

          {/* aria-live: al elegir otra columna, el lector de pantalla lo anuncia. */}
          <p
            aria-live="polite"
            className="mt-2 min-h-11 rounded-lg bg-muted/60 px-3 py-2.5 text-sm print:hidden"
          >
            {columns[selected].text}
          </p>
        </>
      )}
    </div>
  );
}
