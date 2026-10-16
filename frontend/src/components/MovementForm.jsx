import { useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import { apiPatch, apiPost, readErrors } from "../lib/api.js";
import { currencyDecimals, entryCurrency } from "../lib/currency.js";
import { toTypedDate, today } from "../lib/format.js";
import { toOptions } from "../lib/options.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import AmountField, { amountForApi, amountForInput } from "./AmountField.jsx";
import Button from "./Button.jsx";
import DateField, { checkTypedDate } from "./DateField.jsx";
import Field from "./Field.jsx";
import SegmentedControl from "./SegmentedControl.jsx";

// Formulario para registrar un movimiento o corregir uno (`movement`).
// Al guardar llama a onSaved con el movimiento que devuelve la API.
// `rate` es la tasa de hoy. Uno nuevo empieza en la moneda para anotar de la
// familia (spec 013).
export default function MovementForm({ movement, catalogs, rate, onSaved, onCancel }) {
  const { user } = useAuth();
  // Por defecto "gasto", que es lo que más se anota.
  const [type, setType] = useState(movement?.movement_type ?? "expense");
  // Al corregir se muestra lo que se escribió, en su moneda.
  // El monto llega como "45.30" y se muestra con coma, como se escribe aquí.
  const [amount, setAmount] = useState(
    movement
      ? amountForInput(
          movement.original_amount,
          currencyDecimals(catalogs.currencies, movement.original_currency),
        )
      : "",
  );
  const [currency, setCurrency] = useState(
    movement?.original_currency ?? entryCurrency(user, rate),
  );
  const [category, setCategory] = useState(movement?.category.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState(movement?.payment_method.id ?? "");
  // La fecha se escribe dd/mm/aaaa; al enviarla se pasa a "2026-10-15".
  const [date, setDate] = useState(toTypedDate(movement?.date ?? today()));
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
    const checked = checkTypedDate(date);
    if (checked.error) missing.date = checked.error;
    setFieldErrors(missing);
    setGeneralError("");
    if (Object.keys(missing).length > 0) {
      return;
    }

    const body = {
      category: Number(category),
      payment_method: Number(paymentMethod),
      amount: amountForApi(amount, currencyDecimals(catalogs.currencies, currency)),
      currency,
      date: checked.date, // la API espera "2026-10-15"
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
      <AmountField
        amount={amount}
        currency={currency}
        onAmountChange={setAmount}
        onCurrencyChange={setCurrency}
        currencies={catalogs.currencies}
        rate={rate}
        errors={fieldErrors}
        // Un movimiento anotado en una moneda ya desactivada puede conservarla.
        extraCurrency={movement?.original_currency}
      />
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
      <DateField value={date} onChange={setDate} error={fieldErrors.date} />
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
