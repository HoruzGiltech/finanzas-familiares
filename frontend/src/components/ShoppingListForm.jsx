import { useState } from "react";

import { apiPost, readErrors } from "../lib/api.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Field from "./Field.jsx";
import ShoppingListEditor, {
  apiListErrors,
  emptyLine,
  linesForApi,
} from "./ShoppingListEditor.jsx";

// "Lista del supermercado" (spec 011): crea en `month` una partida con su lista.
// La categoría no se elige: es la marcada para la lista (Alimentación) y la
// pone el backend. El monto es el total de la lista; también lo calcula él.
export default function ShoppingListForm({ month, catalogs, usdSymbol, onSaved, onCancel }) {
  const [description, setDescription] = useState("Lista del supermercado");
  const [lines, setLines] = useState(() => [emptyLine()]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [lineErrors, setLineErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusFirstError(fieldErrors);

  const category = catalogs.categories.find((item) => item.is_shopping_list && item.is_active);

  async function handleSubmit(event) {
    event.preventDefault();
    const missing = {};
    if (!description.trim()) missing.description = "Escribe qué es, por ejemplo Mercado.";
    const list = linesForApi(lines);
    const { general: listError, ...byLine } = list.errors;
    setFieldErrors(missing);
    setLineErrors(byLine);
    setGeneralError(listError ?? "");
    if (Object.keys(missing).length > 0 || Object.keys(list.errors).length > 0) return;

    setSaving(true);
    try {
      const { ok, data } = await apiPost("/budget/items/", {
        month,
        description: description.trim(),
        shopping_list: list.lines,
      });
      if (ok) {
        onSaved(data);
        return;
      }
      const errors = readErrors(data);
      const { general, ...apiByLine } = apiListErrors(data, list.sent);
      delete errors.fields.shopping_list;
      setFieldErrors(errors.fields);
      setLineErrors(apiByLine);
      setGeneralError(
        general || errors.general || errors.fields.category || errors.fields.month || "",
      );
    } catch (err) {
      setGeneralError(err.message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {category ? (
        <p className="text-sm text-muted-foreground">
          Se agrega al presupuesto en <strong className="text-foreground">{category.name}</strong>.
        </p>
      ) : (
        <Alert>Tu familia no tiene activa la categoría de la lista del supermercado.</Alert>
      )}
      <Field
        label="Qué es"
        maxLength={200}
        value={description}
        error={fieldErrors.description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div>
        <p className="text-sm font-medium">Productos (precios en dólares)</p>
        <ShoppingListEditor
          lines={lines}
          onChange={setLines}
          errors={lineErrors}
          usdSymbol={usdSymbol}
        />
      </div>

      {generalError && <Alert>{generalError}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={saving} disabled={!category}>
          Agregar al presupuesto
        </Button>
      </div>
    </form>
  );
}
