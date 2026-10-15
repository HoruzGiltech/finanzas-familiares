// La moneda en que se ven los montos. La comparten Inicio y Movimientos y se
// recuerda en este dispositivo (specs 005 y 006).

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
export function currencySymbols(catalogs) {
  return Object.fromEntries((catalogs?.currencies ?? []).map((item) => [item.code, item.symbol]));
}
