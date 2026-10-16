import { formatMoney, formatMonthName, formatShortMonth } from "../lib/format.js";
import ColumnChart from "./ColumnChart.jsx";

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "Septiembre: gastaste $654,20 de $1.100,00 que entraron (balance +$445,80)"
function describe(item, symbol) {
  const name = capitalize(formatMonthName(item.month)) + (item.in_progress ? " (en curso)" : "");
  if (Number(item.income) === 0 && Number(item.expense) === 0) {
    return `${name}: sin movimientos`;
  }
  const spent = formatMoney(item.expense, symbol);
  const came = formatMoney(item.income, symbol);
  return `${name}: gastaste ${spent} de ${came} que entraron (balance ${formatMoney(item.balance, symbol, "+")})`;
}

// Gastos de los últimos 6 meses (spec 007). Solo los gastos en las columnas:
// la pregunta es "¿estoy gastando más?". Ingresos y balance salen en el detalle
// y en la tabla. Empieza elegido el último mes, que es el que se está viendo.
export default function MonthlyChart({ history, symbol }) {
  const columns = history.map((item) => ({
    key: item.month,
    amount: Number(item.expense),
    text: describe(item, symbol),
    axis: formatShortMonth(item.month),
    axisNote: item.in_progress ? "en curso" : null,
  }));

  return (
    <ColumnChart
      title="Últimos 6 meses"
      label="Gastos por mes"
      columns={columns}
      initial={columns.length - 1}
      symbol={symbol}
      table={{
        caption: "Ingresos, gastos y balance de los últimos 6 meses",
        headers: [
          { label: "Mes" },
          { label: "Ingresos", numeric: true },
          { label: "Gastos", numeric: true },
          { label: "Balance", numeric: true },
        ],
        rows: history.map((item) => ({
          key: item.month,
          cells: [
            capitalize(formatMonthName(item.month)),
            formatMoney(item.income, symbol),
            formatMoney(item.expense, symbol),
            formatMoney(item.balance, symbol),
          ],
        })),
      }}
    />
  );
}
