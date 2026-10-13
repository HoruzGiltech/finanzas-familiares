// Formato de montos y fechas en español. Las fechas viajan como texto
// "2026-10-12" y los meses como "2026-10".

const numberFormat = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dayFormat = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" });
const monthFormat = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });

// "1234.5" con símbolo "$" -> "$1.234,50". El signo, si hace falta, va delante: "−$20,00".
// Number() se usa solo para mostrar; las cuentas las hace siempre el backend.
export function formatMoney(amount, symbol, sign = "") {
  const value = Number(amount);
  const prefix = value < 0 ? "−" : sign;
  return `${prefix}${symbol}${numberFormat.format(Math.abs(value))}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// new Date("2026-10-12") se interpreta en UTC y en Venezuela caería en el día
// anterior. Por eso se construye la fecha con sus tres números.
function toDate(text) {
  const [year, month, day = 1] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toText(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// "2026-10-12" -> "Lunes, 12 de octubre"
export function formatDay(dateText) {
  return capitalize(dayFormat.format(toDate(dateText)));
}

// "2026-10" -> "Octubre de 2026"
export function formatMonth(monthText) {
  return capitalize(monthFormat.format(toDate(monthText)));
}

export function today() {
  return toText(new Date());
}

export function currentMonth() {
  return today().slice(0, 7);
}

// shiftMonth("2026-01", -1) -> "2025-12"
export function shiftMonth(monthText, delta) {
  const date = toDate(monthText);
  date.setMonth(date.getMonth() + delta);
  return toText(date).slice(0, 7);
}
