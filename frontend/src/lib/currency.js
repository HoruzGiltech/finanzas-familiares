// La moneda en que se ven los montos. La comparten Inicio y Movimientos y se
// recuerda en este dispositivo (specs 005 y 006).

import { rememberDecimals } from "./format.js";
import { canUse } from "./rates.js";

export const BASE = "USD";
// El nombre viene de la spec 005; se mantiene para no perder lo ya elegido.
const CURRENCY_KEY = "movements-currency";

// localStorage puede fallar (navegación privada, almacenamiento bloqueado):
// entonces, dólares.
export function savedCurrency() {
  try {
    return localStorage.getItem(CURRENCY_KEY) || BASE;
  } catch {
    return BASE;
  }
}

export function saveCurrency(code) {
  try {
    localStorage.setItem(CURRENCY_KEY, code);
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
