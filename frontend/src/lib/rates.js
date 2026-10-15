// La tasa del BCV tal como llega de la API (spec 005):
// { date: "2026-10-14", status: "current", rates: [{ currency: "USD", bs_per_unit: "877.9" }] }

import { formatDay, formatMoney, formatWeekday, today } from "./format.js";

const BASE = "USD";
const BOLIVAR = "VES"; // las tasas se expresan en bolívares

// { USD: 877.9, EUR: 982.76, VES: 1 }. Number() solo para mostrar el equivalente
// aproximado; la conversión que vale la hace el backend.
export function bsPerUnit(rate) {
  const values = { [BOLIVAR]: 1 };
  for (const item of rate?.rates ?? []) {
    values[item.currency] = Number(item.bs_per_unit);
  }
  return values;
}

// Sin tasa (todavía cargando, o nunca guardada) solo se puede usar dólares.
export function canUse(code, rate) {
  return code === BASE || (Boolean(rate) && rate.status !== "missing" && code in bsPerUnit(rate));
}

// Monto en la moneda `code` -> dólares, aproximado.
export function approxUsd(amount, code, rate) {
  const values = bsPerUnit(rate);
  return (amount * values[code]) / values[BASE];
}

// "1 $ = Bs. 877,90 · 1 € = Bs. 982,76". `symbols` = { USD: "$", ... } del catálogo.
export function rateSummary(rate, symbols) {
  return rate.rates
    .map(
      (item) => `1 ${symbols[item.currency]} = ${formatMoney(item.bs_per_unit, symbols[BOLIVAR])}`,
    )
    .join(" · ");
}

// El aviso de la sección 2.3, o null si la tasa es la de hoy.
export function rateNotice(rate, symbols) {
  if (!rate || rate.status === "current") return null;
  if (rate.status === "missing") {
    return "Todavía no hay tasa del BCV; solo se puede usar dólares.";
  }

  const used = `Se usa la del ${formatDay(rate.date).toLowerCase()}: ${rateSummary(rate, symbols)}.`;
  if (rate.status === "outdated") {
    return `La tasa del BCV no está actualizada. ${used}`;
  }
  const weekday = formatWeekday(today());
  const isWeekend = weekday === "sábado" || weekday === "domingo";
  return isWeekend
    ? `Hoy es ${weekday} y el BCV no publica tasa. ${used}`
    : `Hoy el BCV no publicó tasa. ${used}`;
}
