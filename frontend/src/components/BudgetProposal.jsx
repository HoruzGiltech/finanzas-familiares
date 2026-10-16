import { useEffect, useState } from "react";

import { apiGet, apiPost, readErrors } from "../lib/api.js";
import { formatMoney, formatMonthName } from "../lib/format.js";
import { amountForApi } from "./AmountField.jsx";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Skeleton from "./Skeleton.jsx";

// "365.00" -> "365,00", como se escribe aquí.
const typed = (amount) => amount.replace(".", ",");

// Una fila de la propuesta: casilla para incluirla y su monto (en USD), editable.
// Con lista del supermercado (spec 011) el monto es el total de la lista y no
// se cambia aquí, sino en la lista una vez creada.
function Row({ row, onChange, usd, error }) {
  const id = `proposal-${row.key}`;
  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="checkbox"
          checked={row.chosen}
          onChange={(event) => onChange({ ...row, chosen: event.target.checked })}
          className="h-5 w-5 shrink-0 accent-primary"
        />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block font-medium break-words">{row.description}</span>
          <span className="block text-xs text-muted-foreground">{row.detail}</span>
        </label>
        {row.list ? (
          <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
            {formatMoney(row.amount.replace(",", "."), usd)}
          </span>
        ) : (
          <label className="flex shrink-0 items-center gap-1">
            <span className="text-sm text-muted-foreground">{usd}</span>
            <span className="sr-only">Monto de {row.description} en dólares</span>
            <input
              inputMode="decimal"
              value={row.amount}
              disabled={!row.chosen}
              onChange={(event) => onChange({ ...row, amount: event.target.value })}
              className="min-h-11 w-24 rounded-lg border border-border bg-card px-2 text-right text-base tabular-nums disabled:opacity-50"
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

// La propuesta del mes a partir del anterior (spec 010, sección 4). Todo en
// USD, que es como se guarda el presupuesto. Las partidas del mes anterior
// vienen marcadas, con lo que realmente se gastó; los gastos sin presupuestar,
// desmarcados.
export default function BudgetProposal({ month, usdSymbol, onCreated, onCancel }) {
  const [rows, setRows] = useState(null); // null = cargando
  const [previousMonth, setPreviousMonth] = useState("");
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet(`/budget/proposal/?month=${month}`)
      .then(({ ok, data }) => {
        if (!ok) {
          setGeneralError(readErrors(data).general || "No se pudo preparar la propuesta.");
          return;
        }
        setPreviousMonth(data.previous_month);
        setRows([
          ...data.items.map((item, index) => ({
            key: `item-${index}`,
            description: item.description,
            category: item.category,
            amount: typed(item.proposed),
            chosen: true,
            list: item.shopping_list.length > 0 ? item.shopping_list : null,
            detail:
              (item.spent === null
                ? `${item.category.name} · Previsto ${formatMoney(item.planned, usdSymbol)}, quedó pendiente`
                : `${item.category.name} · Previsto ${formatMoney(item.planned, usdSymbol)}, gastado ${formatMoney(item.spent, usdSymbol)}`) +
              (item.shopping_list.length > 0
                ? ` · Lista de ${item.shopping_list.length} productos`
                : ""),
          })),
          ...data.unplanned.map((row) => ({
            key: `unplanned-${row.category.id}`,
            description: row.category.name,
            category: row.category,
            amount: typed(row.amount),
            chosen: false,
            unplanned: true,
            detail: "Gastado sin presupuestar",
          })),
        ]);
      })
      .catch((err) => setGeneralError(err.message));
  }, [month, usdSymbol]);

  function update(changed) {
    setRows((current) => current.map((row) => (row.key === changed.key ? changed : row)));
  }

  async function create() {
    const chosen = rows.filter((row) => row.chosen);
    setGeneralError("");
    setErrors({});
    if (chosen.length === 0) {
      setGeneralError("Marca al menos una partida.");
      return;
    }
    setSaving(true);
    try {
      const { ok, data } = await apiPost("/budget/proposal/", {
        month,
        // La lista se copia tal cual; su total será el monto de la partida.
        items: chosen.map((row) => ({
          description: row.description,
          category: row.category.id,
          ...(row.list
            ? {
                shopping_list: row.list.map(({ name, quantity, unit_price }) => ({
                  name,
                  quantity,
                  unit_price,
                })),
              }
            : { amount: amountForApi(row.amount) }),
        })),
      });
      if (ok) {
        onCreated(data);
        return;
      }
      // Los errores de cada partida llegan por su posición entre las elegidas.
      const byRow = {};
      for (const [index, fields] of Object.entries(data?.items ?? {})) {
        byRow[chosen[Number(index)].key] = Object.values(fields).flat().join(" ");
      }
      setErrors(byRow);
      setGeneralError(readErrors(data).general || "Revisa las partidas marcadas en rojo.");
    } catch (err) {
      setGeneralError(err.message);
    }
    setSaving(false);
  }

  if (!rows) {
    return generalError ? (
      <Alert>{generalError}</Alert>
    ) : (
      <div className="space-y-2" aria-label="Preparando la propuesta">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  const planned = rows.filter((row) => !row.unplanned);
  const unplanned = rows.filter((row) => row.unplanned);
  const rowProps = (row) => ({ row, onChange: update, usd: usdSymbol, error: errors[row.key] });

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        A partir de {formatMonthName(previousMonth)}. Las partidas que se realizaron vienen con lo
        que realmente se gastó. Revisa los montos y desmarca lo que no quieras.
      </p>

      <h3 className="mt-4 text-sm font-semibold">Partidas de {formatMonthName(previousMonth)}</h3>
      <ul className="divide-y divide-border">
        {planned.map((row) => (
          <Row key={row.key} {...rowProps(row)} />
        ))}
      </ul>

      {unplanned.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Gastos sin presupuestar</h3>
          <ul className="divide-y divide-border">
            {unplanned.map((row) => (
              <Row key={row.key} {...rowProps(row)} />
            ))}
          </ul>
        </>
      )}

      {generalError && <Alert className="mt-3">{generalError}</Alert>}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button loading={saving} onClick={create}>
          Crear presupuesto
        </Button>
      </div>
    </div>
  );
}
