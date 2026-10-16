import { daysOfMonth, formatDay, formatMoney, today } from "../lib/format.js";
import ColumnChart from "./ColumnChart.jsx";

const AXIS_DAYS = [1, 8, 15, 22, 29]; // días que llevan su número debajo

// "Martes, 13 de octubre: $45,30 en 3 gastos"
function describe(date, amount, count, symbol) {
  const day = formatDay(date);
  if (count === 0) return `${day}: sin gastos`;
  const expenses = count === 1 ? "1 gasto" : `${count} gastos`;
  return `${day}: ${formatMoney(amount, symbol)} en ${expenses}`;
}

// Una columna por día del mes (spec 006). `days` trae solo los días con gastos
// ([{ date, amount, count }]); los demás se dibujan en cero. Los días que aún no
// han llegado quedan vacíos y no se pueden elegir. Empieza elegido el de más gasto.
export default function DailyChart({ title, month, days, symbol }) {
  const byDate = Object.fromEntries(days.map((day) => [day.date, day]));
  const now = today();
  const columns = daysOfMonth(month).map((date, index) => {
    const amount = Number(byDate[date]?.amount ?? 0);
    const count = byDate[date]?.count ?? 0;
    return {
      key: date,
      amount,
      text: describe(date, amount, count, symbol),
      axis: AXIS_DAYS.includes(index + 1) ? String(index + 1) : null,
      // Con gastos nunca es futuro: el reloj del móvil puede ir detrás del de Venezuela.
      disabled: date > now && !byDate[date],
    };
  });

  return (
    <ColumnChart
      title={title}
      label="Gastos por día"
      columns={columns}
      symbol={symbol}
      table={{
        caption: "Gastos por día",
        headers: [
          { label: "Día" },
          { label: "Gastos", numeric: true },
          { label: "Monto", numeric: true },
        ],
        rows: days.map((day) => ({
          key: day.date,
          cells: [formatDay(day.date), day.count, formatMoney(day.amount, symbol)],
        })),
      }}
    />
  );
}
