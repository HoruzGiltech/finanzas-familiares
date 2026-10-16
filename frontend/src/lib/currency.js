// La moneda en que se ven los montos. La comparten Inicio, Movimientos y
// Presupuesto y se recuerda en este dispositivo (specs 005 y 006).
//
// Spec 015: sin elección propia se ve la moneda para ver de la familia. La
// elección se guarda junto con la moneda de la familia que regía al hacerla:
// si el administrador la cambia después, la elección vieja se descarta.

import { rememberDecimals } from "./format.js";
import { canUse } from "./rates.js";

export const BASE = "USD";
// El nombre viene de la spec 005; se mantiene para no perder lo ya elegido.
const CURRENCY_KEY = "movements-currency";

// localStorage puede fallar (navegación privada, almacenamiento bloqueado):
// entonces, la moneda de la familia.
export function savedCurrency(familyCurrency) {
  try {
    const saved = JSON.parse(localStorage.getItem(CURRENCY_KEY));
    return saved?.family === familyCurrency ? saved.code : familyCurrency;
  } catch {
    // También llega aquí lo guardado antes de la spec 015 ("VES", sin JSON):
    // se descarta y se empieza con la moneda de la familia.
    return familyCurrency;
  }
}

export function saveCurrency(code, familyCurrency) {
  try {
    localStorage.setItem(CURRENCY_KEY, JSON.stringify({ code, family: familyCurrency }));
  } catch {
    // Sin almacenamiento solo se pierde el recuerdo; la pantalla sigue igual.
  }
}

// { USD: "$", VES: "Bs.", EUR: "€" }: los símbolos salen del catálogo.
// De paso le cuenta a formatMoney cuántos decimales lleva cada moneda (spec 013).
export function currencySymbols(catalogs) {
  const currencies = catalogs?.currencies ?? [];
  rememberDecimals(currencies);
  return Object.fromEntries(currencies.map((item) => [item.code, item.symbol]));
}

// Cuántos decimales se escriben en la moneda `code`: 0 en pesos chilenos.
export function currencyDecimals(currencies, code) {
  return currencies.find((item) => item.code === code)?.decimals ?? 2;
}

// La moneda con la que empiezan los formularios: la que eligió el
// administrador, si hoy tiene tasa; si no, dólares.
export function entryCurrency(user, rate) {
  const code = user?.family.entry_currency ?? BASE;
  return canUse(code, rate) ? code : BASE;
}
