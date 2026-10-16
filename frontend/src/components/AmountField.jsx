import { formatMoney } from "../lib/format.js";
import { approxUsd, canUse } from "../lib/rates.js";
import Field from "./Field.jsx";
import { RateNotice } from "./RateInfo.jsx";
import SegmentedControl from "./SegmentedControl.jsx";

// "1500,5" -> 1500.5, o null si no es un número. Solo para el equivalente aproximado.
function parseAmount(text) {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

// En Venezuela los decimales se escriben con coma; la API los espera con punto.
export function amountForApi(text) {
  return text.trim().replace(",", ".");
}

// Monto con su moneda ($ · € · Bs.). En otra moneda enseña cuánto será en
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
  const typed = parseAmount(amount);
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
            placeholder="0,00"
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
