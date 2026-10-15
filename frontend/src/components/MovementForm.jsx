import { useState } from "react";

import { apiPatch, apiPost, readErrors } from "../lib/api.js";
import { formatMoney, today } from "../lib/format.js";
import { approxUsd, canUse } from "../lib/rates.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Field from "./Field.jsx";
import { RateNotice } from "./RateInfo.jsx";
import SegmentedControl from "./SegmentedControl.jsx";

// Opciones de una lista desplegable. Si el movimiento que se corrige usa un
// elemento ya desactivado (`current`), se añade para que pueda conservarlo.
function toOptions(items, current, placeholder) {
  const options = items.map((item) => ({ value: item.id, label: item.name }));
  if (current && !items.some((item) => item.id === current.id)) {
    options.push({ value: current.id, label: `${current.name} (desactivada)` });
  }
  return [{ value: "", label: placeholder }, ...options];
}

// "1500,5" -> 1500.5, o null si no es un número. Solo para el equivalente aproximado.
function parseAmount(text) {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

// Formulario para registrar un movimiento o corregir uno (`movement`).
// Al guardar llama a onSaved con el movimiento que devuelve la API.
// `rate` es la tasa de hoy; `defaultCurrency`, la moneda que se está viendo.
export default function MovementForm({
  movement,
  catalogs,
  rate,
  defaultCurrency,
  onSaved,
  onCancel,
}) {
  // Por defecto "gasto", que es lo que más se anota.
  const [type, setType] = useState(movement?.movement_type ?? "expense");
  // Al corregir se muestra lo que se escribió, en su moneda.
  // El monto llega como "45.30" y se muestra con coma, como se escribe aquí.
  const [amount, setAmount] = useState(movement?.original_amount.replace(".", ",") ?? "");
  const [currency, setCurrency] = useState(
    movement?.original_currency ?? (canUse(defaultCurrency, rate) ? defaultCurrency : "USD"),
  );
  const [category, setCategory] = useState(movement?.category.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState(movement?.payment_method.id ?? "");
  const [date, setDate] = useState(movement?.date ?? today());
  const [description, setDescription] = useState(movement?.description ?? "");
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusFirstError(fieldErrors);

  const typeOptions = catalogs.movement_types.map((item) => ({
    value: item.code,
    label: item.name,
  }));
  const categoryOptions = toOptions(
    catalogs.categories.filter((item) => item.movement_type === type),
    movement?.movement_type === type ? movement.category : null,
    "Elige una categoría",
  );
  const symbols = Object.fromEntries(catalogs.currencies.map((item) => [item.code, item.symbol]));
  const currencyOptions = catalogs.currencies.map((item) => ({
    value: item.code,
    label: item.symbol,
    ariaLabel: item.name,
    disabled: !canUse(item.code, rate),
  }));
  // Un movimiento anotado en una moneda ya desactivada puede conservarla.
  if (movement && !(movement.original_currency in symbols)) {
    currencyOptions.push({ value: movement.original_currency, label: movement.original_currency });
  }
  // En otra moneda se enseña cuánto será en dólares; el número que vale lo calcula el backend.
  const typed = parseAmount(amount);
  const equivalent =
    currency === "USD"
      ? null
      : typed
        ? `≈ ${formatMoney(approxUsd(typed, currency, rate), symbols.USD)} con la tasa de hoy`
        : "Se guardará en dólares con la tasa de hoy.";
  const paymentMethodOptions = toOptions(
    catalogs.payment_methods,
    movement?.payment_method,
    "Elige un método de pago",
  );

  function changeType(newType) {
    setType(newType);
    setCategory(""); // las categorías de un tipo no valen para el otro
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const missing = {};
    if (!amount.trim()) missing.amount = "Escribe el monto.";
    if (!category) missing.category = "Elige una categoría.";
    if (!paymentMethod) missing.payment_method = "Elige un método de pago.";
    if (!date) missing.date = "Elige la fecha.";
    setFieldErrors(missing);
    setGeneralError("");
    if (Object.keys(missing).length > 0) {
      return;
    }

    const body = {
      category: Number(category),
      payment_method: Number(paymentMethod),
      // En Venezuela los decimales se escriben con coma; la API los espera con punto.
      amount: amount.trim().replace(",", "."),
      currency,
      date,
      description: description.trim(),
    };

    setSaving(true);
    try {
      const { ok, data } = movement
        ? await apiPatch(`/movements/${movement.id}/`, body)
        : await apiPost("/movements/", body);
      if (ok) {
        onSaved(data);
        return;
      }
      const errors = readErrors(data);
      setFieldErrors(errors.fields);
      setGeneralError(errors.general);
    } catch (err) {
      setGeneralError(err.message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <SegmentedControl
        label="Tipo de movimiento"
        options={typeOptions}
        value={type}
        onChange={changeType}
      />

      <div>
        <div className="flex items-start gap-2">
          <Field
            label="Monto"
            inputMode="decimal" // teclado numérico en el móvil
            placeholder="0,00"
            autoComplete="off"
            value={amount}
            error={fieldErrors.amount}
            onChange={(event) => setAmount(event.target.value)}
            className="min-w-0 flex-1"
          />
          {/* mt-6: a la altura del campo, bajo la etiqueta "Monto". */}
          <SegmentedControl
            label="Moneda del monto"
            options={currencyOptions}
            value={currency}
            onChange={setCurrency}
            className="mt-6 shrink-0"
          />
        </div>
        {equivalent && (
          <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {equivalent}
          </p>
        )}
        {fieldErrors.currency && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {fieldErrors.currency}
          </p>
        )}
      </div>
      {currency !== "USD" && <RateNotice rate={rate} symbols={symbols} />}
      <Field
        label="Categoría"
        options={categoryOptions}
        value={category}
        error={fieldErrors.category}
        onChange={(event) => setCategory(event.target.value)}
      />
      <Field
        label="Método de pago"
        options={paymentMethodOptions}
        value={paymentMethod}
        error={fieldErrors.payment_method}
        onChange={(event) => setPaymentMethod(event.target.value)}
      />
      <Field
        label="Fecha"
        type="date"
        max={today()}
        value={date}
        error={fieldErrors.date}
        onChange={(event) => setDate(event.target.value)}
      />
      <Field
        label="Descripción (opcional)"
        maxLength={200}
        placeholder="Mercado de la semana"
        value={description}
        error={fieldErrors.description}
        onChange={(event) => setDescription(event.target.value)}
      />

      {generalError && <Alert>{generalError}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {movement ? "Guardar cambios" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
