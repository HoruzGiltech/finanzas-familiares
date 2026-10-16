import { useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import { apiPatch, apiPost, readErrors } from "../lib/api.js";
import { currencyDecimals, entryCurrency } from "../lib/currency.js";
import { formatMoney } from "../lib/format.js";
import { toOptions } from "../lib/options.js";
import { canUse } from "../lib/rates.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import AmountField, { amountForApi, amountForInput } from "./AmountField.jsx";
import Button from "./Button.jsx";
import Field from "./Field.jsx";

// Formulario de una partida del presupuesto (spec 010): crear una nueva en
// `month` o corregir `item`. El monto se guarda en USD; si se escribe en otra
// moneda, el backend lo convierte con la tasa de hoy.
//
// `item.amount` viene en la moneda que se está viendo (`viewCurrency`): al
// corregir se muestra así, y solo se envía si se cambió, para no mover el USD
// guardado por redondeos.
//
// Si la partida tiene lista del supermercado (spec 011), el monto sale de la
// lista y aquí solo se enseña.
export default function BudgetItemForm({
  item,
  month,
  catalogs,
  rate,
  viewCurrency,
  symbol,
  onSaved,
  onCancel,
}) {
  const { user } = useAuth();
  const decimalsOf = (code) => currencyDecimals(catalogs.currencies, code);
  const startAmount = item ? amountForInput(item.amount, decimalsOf(viewCurrency)) : "";
  // Una nueva empieza en la moneda para anotar de la familia (spec 013).
  const viewOk = canUse(viewCurrency, rate) ? viewCurrency : "USD";
  const startCurrency = item ? viewOk : entryCurrency(user, rate);
  const fromList = item?.shopping_list.length > 0;
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category.id ?? "");
  const [amount, setAmount] = useState(startAmount);
  const [currency, setCurrency] = useState(startCurrency);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusFirstError(fieldErrors);

  const categoryOptions = toOptions(
    catalogs.categories.filter((option) => option.movement_type === "expense"),
    item?.category,
    "Elige una categoría de gasto",
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const missing = {};
    if (!description.trim()) missing.description = "Escribe qué es, por ejemplo Alquiler.";
    if (!category) missing.category = "Elige una categoría.";
    if (!fromList && !amount.trim()) missing.amount = "Escribe el monto aproximado.";
    setFieldErrors(missing);
    setGeneralError("");
    if (Object.keys(missing).length > 0) return;

    const body = { description: description.trim(), category: Number(category) };
    if (!item || amount !== startAmount || currency !== startCurrency) {
      body.amount = amountForApi(amount, decimalsOf(currency));
      body.currency = currency;
    }

    setSaving(true);
    try {
      const { ok, data } = item
        ? await apiPatch(`/budget/items/${item.id}/`, body)
        : await apiPost("/budget/items/", { ...body, month });
      if (ok) {
        onSaved(data);
        return;
      }
      const errors = readErrors(data);
      setFieldErrors(errors.fields);
      setGeneralError(errors.general || errors.fields.month || "");
    } catch (err) {
      setGeneralError(err.message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field
        label="Qué es"
        maxLength={200}
        placeholder="Alquiler"
        value={description}
        error={fieldErrors.description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Field
        label="Categoría"
        options={categoryOptions}
        value={category}
        error={fieldErrors.category}
        onChange={(event) => setCategory(event.target.value)}
      />
      {fromList ? (
        <p className="text-sm text-muted-foreground">
          Monto: <strong className="text-foreground">{formatMoney(item.amount, symbol)}</strong>.
          Sale de la lista: para cambiarlo, cambia los productos.
        </p>
      ) : (
        <AmountField
          label="Monto aproximado"
          amount={amount}
          currency={currency}
          onAmountChange={setAmount}
          onCurrencyChange={setCurrency}
          currencies={catalogs.currencies}
          rate={rate}
          errors={fieldErrors}
        />
      )}

      {generalError && <Alert>{generalError}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving}>
          {item ? "Guardar cambios" : "Agregar"}
        </Button>
      </div>
    </form>
  );
}
