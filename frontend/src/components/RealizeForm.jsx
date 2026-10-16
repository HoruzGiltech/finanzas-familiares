import { useState } from "react";

import { apiPost, readErrors } from "../lib/api.js";
import { daysOfMonth, formatMoney, toTypedDate, today } from "../lib/format.js";
import { toOptions } from "../lib/options.js";
import { canUse } from "../lib/rates.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import AmountField, { amountForApi } from "./AmountField.jsx";
import Button from "./Button.jsx";
import DateField, { checkTypedDate } from "./DateField.jsx";
import Field from "./Field.jsx";

// Hoy, o el último día del mes si el presupuesto es de un mes que ya pasó.
function startDate(month) {
  const lastDay = daysOfMonth(month).at(-1);
  return lastDay < today() ? lastDay : today();
}

// "Marcar como realizado" (spec 010, regla 7): crea el movimiento de la partida.
// Pregunta el método de pago, el monto real (empieza con el previsto, en la
// moneda que se está viendo) y la fecha.
export default function RealizeForm({
  item,
  catalogs,
  rate,
  viewCurrency,
  symbol,
  onSaved,
  onCancel,
}) {
  const currencyOk = canUse(viewCurrency, rate);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [amount, setAmount] = useState(item.amount.replace(".", ","));
  const [currency, setCurrency] = useState(currencyOk ? viewCurrency : "USD");
  const [date, setDate] = useState(toTypedDate(startDate(item.month)));
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusFirstError(fieldErrors);

  async function handleSubmit(event) {
    event.preventDefault();
    const missing = {};
    if (!paymentMethod) missing.payment_method = "Elige con qué se pagó.";
    if (!amount.trim()) missing.amount = "Escribe cuánto se pagó.";
    const checked = checkTypedDate(date);
    if (checked.error) missing.date = checked.error;
    setFieldErrors(missing);
    setGeneralError("");
    if (Object.keys(missing).length > 0) return;

    setSaving(true);
    try {
      const { ok, data } = await apiPost(`/budget/items/${item.id}/realize/`, {
        payment_method: Number(paymentMethod),
        amount: amountForApi(amount),
        currency,
        date: checked.date,
      });
      if (ok) {
        onSaved(data);
        return;
      }
      const errors = readErrors(data);
      setFieldErrors(errors.fields);
      setGeneralError(errors.general || errors.fields.category || "");
    } catch (err) {
      setGeneralError(err.message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{item.description}</strong> ({item.category.name}),
        previsto {formatMoney(item.amount, symbol)}. Se anotará como gasto en Movimientos.
      </p>
      <Field
        label="Método de pago"
        options={toOptions(catalogs.payment_methods, null, "¿Con qué se pagó?")}
        value={paymentMethod}
        error={fieldErrors.payment_method}
        onChange={(event) => setPaymentMethod(event.target.value)}
      />
      <AmountField
        label="Monto real"
        amount={amount}
        currency={currency}
        onAmountChange={setAmount}
        onCurrencyChange={setCurrency}
        currencies={catalogs.currencies}
        rate={rate}
        errors={fieldErrors}
      />
      <DateField value={date} onChange={setDate} error={fieldErrors.date} />

      {generalError && <Alert>{generalError}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          Marcar como realizado
        </Button>
      </div>
    </form>
  );
}
