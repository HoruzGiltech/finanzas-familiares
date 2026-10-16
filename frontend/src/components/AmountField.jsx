import { currencyDecimals } from "../lib/currency.js";
import { formatMoney } from "../lib/format.js";
import { approxUsd, canUse } from "../lib/rates.js";
import Field from "./Field.jsx";
import { RateNotice } from "./RateInfo.jsx";
import SegmentedControl from "./SegmentedControl.jsx";

// "1500,5" -> 1500.5, o null si no es un número. Solo para el equivalente aproximado.
function parseAmount(text, decimals) {
  const value = Number(amountForApi(text, decimals));
  return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

// En Venezuela los decimales se escriben con coma; la API los espera con punto.
// En una moneda sin decimales (pesos chilenos) el punto separa los miles:
// "50.000" son cincuenta mil. Una coma se deja, y la API avisa de que sobra.
export function amountForApi(text, decimals = 2) {
  const clean = text.trim();
  return decimals === 0 ? clean.replace(/[.\s]/g, "") : clean.replace(",", ".");
}

// "45.30" de la API -> "45,30" para el campo; en pesos, "9840.90" -> "9841".
export function amountForInput(apiText, decimals = 2) {
  return Number(apiText).toFixed(decimals).replace(".", ",");
}

// Monto con su moneda ($ · € · Bs. · CLP$). En otra moneda enseña cuánto será en
// dólares con la tasa de hoy; el número que vale lo calcula el backend.
// `extraCurrency`: una moneda ya desactivada que se puede conservar al corregir.
export default function AmountField({
  label = "Monto",
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  currencies,
  rate,
  errors = {},
  extraCurrency,
}) {
  const symbols = Object.fromEntries(currencies.map((item) => [item.code, item.symbol]));
  const options = currencies.map((item) => ({
    value: item.code,
    label: item.symbol,
    ariaLabel: item.name,
    disabled: !canUse(item.code, rate),
  }));
  if (extraCurrency && !(extraCurrency in symbols)) {
    options.push({ value: extraCurrency, label: extraCurrency });
  }
  const decimals = currencyDecimals(currencies, currency);
  const typed = parseAmount(amount, decimals);
  const equivalent =
    currency === "USD"
      ? null
      : typed
        ? `≈ ${formatMoney(approxUsd(typed, currency, rate), symbols.USD)} con la tasa de hoy`
        : "Se guardará en dólares con la tasa de hoy.";

  return (
    <>
      <div>
        <div className="flex items-start gap-2">
          <Field
            label={label}
            inputMode="decimal" // teclado numérico en el móvil
            placeholder={decimals === 0 ? "0" : "0,00"}
            autoComplete="off"
            value={amount}
            error={errors.amount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="min-w-0 flex-1"
          />
          {/* mt-6: a la altura del campo, bajo su etiqueta. */}
          <SegmentedControl
            label="Moneda del monto"
            options={options}
            value={currency}
            onChange={onCurrencyChange}
            className="mt-6 shrink-0"
          />
        </div>
        {equivalent && (
          <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {equivalent}
          </p>
        )}
        {errors.currency && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {errors.currency}
          </p>
        )}
      </div>
      {currency !== "USD" && <RateNotice rate={rate} symbols={symbols} />}
    </>
  );
}
