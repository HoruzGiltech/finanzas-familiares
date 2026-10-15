import { motion } from "motion/react";
import { useRef, useState } from "react";

import { daysOfMonth, formatDay, formatMoney, today } from "../lib/format.js";
import { duration, ease } from "../lib/motion.js";

const AXIS_DAYS = [1, 8, 15, 22, 29]; // días que llevan su número debajo

// "Martes, 13 de octubre: $45,30 en 3 gastos"
function describe(column, symbol) {
  const day = formatDay(column.date);
  if (column.count === 0) return `${day}: sin gastos`;
  const expenses = column.count === 1 ? "1 gasto" : `${column.count} gastos`;
  return `${day}: ${formatMoney(column.amount, symbol)} en ${expenses}`;
}

// Una columna por día del mes. `days` trae solo los días con gastos
// ([{ date, amount, count }]); los demás se dibujan en cero. Los días que aún no
// han llegado quedan vacíos y no se pueden elegir.
//
// El detalle del día elegido se queda fijo debajo del gráfico: en el móvil no
// hay cursor, así que se elige tocando (o con las flechas del teclado).
export default function DailyChart({ title, month, days, symbol }) {
  const byDate = Object.fromEntries(days.map((day) => [day.date, day]));
  const now = today();
  const columns = daysOfMonth(month).map((date) => ({
    date,
    amount: Number(byDate[date]?.amount ?? 0),
    count: byDate[date]?.count ?? 0,
    // Con gastos nunca es futuro: el reloj del móvil puede ir detrás del de Venezuela.
    future: date > now && !byDate[date],
  }));
  const biggest = Math.max(...columns.map((column) => column.amount));
  const peak = columns.findIndex((column) => column.amount === biggest);
  const lastDay = columns.findLastIndex((column) => !column.future);

  const [selected, setSelected] = useState(peak);
  const [asTable, setAsTable] = useState(false);
  const buttons = useRef([]);

  // Flechas, Inicio y Fin mueven la selección (un solo Tab entra al gráfico).
  function handleKey(event) {
    const moves = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: lastDay };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.min(Math.max(moves[event.key], 0), lastDay);
    setSelected(next);
    buttons.current[next]?.focus();
  }

  const peakColumn = columns[peak];
  // La etiqueta del pico se alinea hacia dentro para no salirse por los bordes.
  const peakOnLeft = peak < columns.length / 2;
  const peakEdge = `${((peakOnLeft ? peak : peak + 1) / columns.length) * 100}%`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          className="-mr-2 min-h-11 cursor-pointer rounded-lg px-2 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary-soft"
        >
          {asTable ? "Ver como gráfico" : "Ver como tabla"}
        </button>
      </div>

      {asTable ? (
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Gastos por día</caption>
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 font-medium">
                Día
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Gastos
              </th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">
                Monto
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} className="border-b border-border last:border-0">
                <td className="py-2">{formatDay(day.date)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{day.count}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
                  {formatMoney(day.amount, symbol)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="relative mt-2 pt-6">
            <p
              aria-hidden="true"
              className="absolute top-0 text-xs font-semibold whitespace-nowrap tabular-nums"
              style={peakOnLeft ? { left: peakEdge } : { right: `calc(100% - ${peakEdge})` }}
            >
              {formatMoney(peakColumn.amount, symbol)}
            </p>

            <div
              role="group"
              aria-label="Gastos por día. Usa las flechas para cambiar de día."
              onKeyDown={handleKey}
              className="flex h-40 items-end gap-px border-b border-border sm:gap-1"
            >
              {columns.map((column, index) =>
                column.future ? (
                  <div key={column.date} className="h-full flex-1" />
                ) : (
                  <button
                    key={column.date}
                    ref={(element) => (buttons.current[index] = element)}
                    type="button"
                    tabIndex={index === selected ? 0 : -1}
                    aria-pressed={index === selected}
                    aria-label={describe(column, symbol)}
                    onClick={() => setSelected(index)}
                    onMouseEnter={() => setSelected(index)}
                    // Toda la altura se puede tocar, no solo la columna.
                    className="flex h-full min-w-0 flex-1 cursor-pointer items-end rounded-sm focus-visible:outline-offset-0"
                  >
                    <motion.span
                      className={
                        "block w-full origin-bottom rounded-t-[3px] transition-colors duration-150 " +
                        (index === selected ? "bg-primary" : "bg-primary/45")
                      }
                      style={{ height: `${(column.amount / biggest) * 100}%` }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: duration.slow, ease }}
                    />
                  </button>
                ),
              )}
            </div>

            {/* Números de algunos días, centrados bajo su columna. */}
            <div aria-hidden="true" className="relative h-5 text-xs text-muted-foreground">
              {AXIS_DAYS.filter((day) => day <= columns.length).map((day) => (
                <span
                  key={day}
                  className="absolute top-1 -translate-x-1/2 tabular-nums"
                  style={{ left: `${((day - 0.5) / columns.length) * 100}%` }}
                >
                  {day}
                </span>
              ))}
            </div>
          </div>

          {/* aria-live: al elegir otro día, el lector de pantalla lo anuncia. */}
          <p
            aria-live="polite"
            className="mt-2 min-h-11 rounded-lg bg-muted/60 px-3 py-2.5 text-sm"
          >
            {describe(columns[selected], symbol)}
          </p>
        </>
      )}
    </div>
  );
}
