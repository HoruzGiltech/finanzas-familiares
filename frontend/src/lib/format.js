// Formato de montos y fechas en español. Las fechas viajan como texto
// "2026-10-12" y los meses como "2026-10".

const numberFormat = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dayFormat = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" });
const monthFormat = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat("es", { weekday: "long" });

// "1234.5" con símbolo "$" -> "$1.234,50". El signo, si hace falta, va delante: "−$20,00".
// Los símbolos que terminan en letra o punto llevan espacio: "Bs. 1.234,50". Es un
// espacio irrompible, para que símbolo y cifra no se separen al saltar de línea.
// Number() se usa solo para mostrar; las cuentas las hace siempre el backend.
export function formatMoney(amount, symbol, sign = "") {
  const value = Number(amount);
  const prefix = value < 0 ? "−" : sign;
  const space = /[\p{L}.]$/u.test(symbol) ? " " : "";
  return `${prefix}${symbol}${space}${numberFormat.format(Math.abs(value))}`;
}

const percentFormat = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// "35.5" -> "35,5 %". El espacio es irrompible, como en los montos.
export function formatPercent(value) {
  return `${percentFormat.format(Number(value))} %`;
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

// "2026-10-10" -> "sábado"
export function formatWeekday(dateText) {
  return weekdayFormat.format(toDate(dateText));
}

const monthNameFormat = new Intl.DateTimeFormat("es", { month: "long" });
const shortMonthFormat = new Intl.DateTimeFormat("es", { month: "short" });

// "2026-09" -> "septiembre"
export function formatMonthName(monthText) {
  return monthNameFormat.format(toDate(monthText));
}

// "2026-09" -> "sept" (sin el punto, para que quepa bajo una columna)
export function formatShortMonth(monthText) {
  return shortMonthFormat.format(toDate(monthText)).replace(".", "");
}

// "2026-10" -> "Octubre de 2026"
export function formatMonth(monthText) {
  return capitalize(monthFormat.format(toDate(monthText)));
}

// "2026-10" -> ["2026-10-01", ..., "2026-10-31"]
export function daysOfMonth(monthText) {
  const date = toDate(monthText);
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from(
    { length: count },
    (_, index) => `${monthText}-${String(index + 1).padStart(2, "0")}`,
  );
}

export function today() {
  return toText(new Date());
}

// shiftDay("2026-10-01", -1) -> "2026-09-30"
export function shiftDay(dateText, delta) {
  const date = toDate(dateText);
  date.setDate(date.getDate() + delta);
  return toText(date);
}

// Fechas que escribe la persona: siempre dd/mm/aaaa, como se usa en Venezuela.
// El campo de fecha del navegador sigue el idioma del navegador (en inglés,
// mm/dd/aaaa) y no se puede cambiar; por eso es un campo de texto.

// "2026-10-15" -> "15/10/2026"
export function toTypedDate(dateText) {
  const [year, month, day] = dateText.split("-");
  return `${day}/${month}/${year}`;
}

// Mientras se escribe pone las barras solas: "15102026" -> "15/10/2026".
// Solo añade una barra cuando ya hay un número detrás, así borrar funciona normal.
// Quien escribe la barra tras un solo número quiere decir 0: "1/" -> "01/".
export function maskTypedDate(text) {
  const padded = text.replace(/^(\d)\//, "0$1/").replace(/^(\d{2}\/)(\d)\//, "$10$2/");
  const digits = padded.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
  return parts.filter(Boolean).join("/");
}

// "15/10/2026" -> "2026-10-15", o null si no es una fecha que exista ("31/02/2026").
export function parseTypedDate(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const dateText = `${year}-${month}-${day}`;
  return toText(toDate(dateText)) === dateText ? dateText : null;
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
