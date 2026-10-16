import { Download } from "lucide-react";
import { useState } from "react";

import { apiDownload, readErrors } from "../lib/api.js";
import { currentMonth, daysOfMonth, shiftMonth, toTypedDate, today } from "../lib/format.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import DateField, { checkTypedDate } from "./DateField.jsx";

// Del día 1 al último del mes; si el mes es el actual, hasta hoy (el calendario
// no deja elegir días futuros).
function monthRange(month) {
  const days = daysOfMonth(month);
  const last = days.at(-1);
  return [days[0], last < today() ? last : today()];
}

function shortcuts() {
  return [
    ["Este mes", monthRange(currentMonth())],
    ["Mes anterior", monthRange(shiftMonth(currentMonth(), -1))],
    ["Este año", [`${today().slice(0, 4)}-01-01`, today()]],
  ];
}

// "Exportar" en Movimientos (spec 008): elige el rango y descarga el CSV.
// Empieza con el mes que se está viendo (`month`).
export default function ExportForm({ month, onDone, onCancel }) {
  const [start, end] = monthRange(month);
  const [from, setFrom] = useState(toTypedDate(start));
  const [to, setTo] = useState(toTypedDate(end));
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusFirstError(fieldErrors);

  function choose([newFrom, newTo]) {
    setFrom(toTypedDate(newFrom));
    setTo(toTypedDate(newTo));
    setFieldErrors({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const checkedFrom = checkTypedDate(from);
    const checkedTo = checkTypedDate(to);
    const errors = {};
    if (checkedFrom.error) errors.from = checkedFrom.error;
    if (checkedTo.error) errors.to = checkedTo.error;
    if (!errors.from && !errors.to && checkedFrom.date > checkedTo.date) {
      errors.to = "Debe ser igual o posterior a «Desde».";
    }
    setFieldErrors(errors);
    setGeneralError("");
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const range = `from=${checkedFrom.date}&to=${checkedTo.date}`;
      const filename = `movimientos-${checkedFrom.date}-a-${checkedTo.date}.csv`;
      const { ok, data } = await apiDownload(`/movements/export/?${range}`, filename);
      if (ok) {
        onDone();
        return;
      }
      const apiErrors = readErrors(data);
      setFieldErrors(apiErrors.fields);
      setGeneralError(apiErrors.general || (data ? "" : "No se pudo descargar el archivo."));
    } catch (err) {
      setGeneralError(err.message);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Descarga los movimientos de estas fechas en un archivo CSV, que se abre con Excel o Google
        Sheets.
      </p>
      <div className="flex flex-wrap gap-2">
        {shortcuts().map(([label, range]) => (
          <Button
            key={label}
            variant="secondary"
            aria-pressed={from === toTypedDate(range[0]) && to === toTypedDate(range[1])}
            onClick={() => choose(range)}
            className="aria-pressed:border-primary aria-pressed:text-primary"
          >
            {label}
          </Button>
        ))}
      </div>
      <DateField
        label="Desde"
        value={from}
        onChange={setFrom}
        error={fieldErrors.from}
        quickDays={false}
      />
      <DateField
        label="Hasta"
        value={to}
        onChange={setTo}
        error={fieldErrors.to}
        quickDays={false}
      />

      {generalError && <Alert>{generalError}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" icon={Download} loading={saving}>
          Descargar CSV
        </Button>
      </div>
    </form>
  );
}
