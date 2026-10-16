import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleDashed,
  Pencil,
  ShoppingCart,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import { apiPut, readErrors } from "../lib/api.js";
import { formatDay, formatMoney } from "../lib/format.js";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import ShoppingListEditor, {
  apiListErrors,
  emptyLine,
  linesForApi,
  linesFromApi,
} from "./ShoppingListEditor.jsx";

// "↑ $10,00 más de lo previsto": icono y texto, no solo color.
export function Difference({ item, symbol }) {
  const difference = Number(item.movement.amount) - Number(item.amount);
  if (Math.abs(difference) < 0.005) return null;
  const more = difference > 0;
  const Icon = more ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 ${more ? "text-danger" : "text-accent-strong"}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {formatMoney(Math.abs(difference), symbol)} {more ? "más" : "menos"} de lo previsto
    </span>
  );
}

// "2 × Leche  $1,80  $3,60": la lista solo para leer (realizada o lector).
function ReadOnlyList({ list, usdSymbol }) {
  return (
    <ul className="divide-y divide-border text-sm">
      {list.map((line) => (
        <li key={line.id} className="flex items-baseline gap-3 py-2">
          <span className="min-w-0 flex-1 break-words">
            <span className="text-muted-foreground tabular-nums">
              {line.quantity.replace(".", ",").replace(/,00$/, "")} ×{" "}
            </span>
            {line.name}
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatMoney(line.unit_price, usdSymbol)}
          </span>
          <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
            {formatMoney(line.total, usdSymbol)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Detalle de una partida (spec 011): su estado, su lista y las acciones que
// antes estaban en cada renglón. Los montos de la partida van en la moneda que
// se ve (`symbol`); los de la lista, en USD, que es como se escriben.
export default function BudgetItemDetail({
  item,
  symbol,
  usdSymbol,
  canEdit,
  onRealize,
  onEdit,
  onRemove,
  onUndo,
  onListSaved,
}) {
  const movement = item.movement;
  const hasList = item.shopping_list.length > 0;
  const editable = canEdit && !movement;
  // La lista que se edita; null mientras una partida sin lista no la pida.
  const [lines, setLines] = useState(() => (hasList ? linesFromApi(item.shopping_list) : null));
  const [lineErrors, setLineErrors] = useState({});
  const [listError, setListError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false); // "Lista guardada" hasta el siguiente cambio

  function changeLines(changed) {
    setLines(changed);
    setSaved(false);
  }

  async function saveList() {
    const list = linesForApi(lines);
    const { general, ...byLine } = list.errors;
    setLineErrors(byLine);
    setListError(general ?? "");
    if (Object.keys(list.errors).length > 0) return;

    setSaving(true);
    try {
      const { ok, data } = await apiPut(`/budget/items/${item.id}/list/`, {
        shopping_list: list.lines,
      });
      if (ok) {
        setLines(linesFromApi(data.shopping_list));
        setSaved(true);
        onListSaved();
      } else {
        const { general: apiGeneral, ...apiByLine } = apiListErrors(data, list.sent);
        setLineErrors(apiByLine);
        setListError(apiGeneral || readErrors(data).general || "No se pudo guardar la lista.");
      }
    } catch (err) {
      setListError(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{item.category.name}</p>
        <p className="mt-1 flex items-baseline justify-between gap-3">
          <span className="font-medium">Previsto</span>
          <span className="text-lg font-semibold whitespace-nowrap tabular-nums">
            {formatMoney(item.amount, symbol)}
          </span>
        </p>
        {movement ? (
          <div className="mt-2 rounded-lg bg-accent-soft/60 px-3 py-2 text-sm">
            <p className="flex items-center gap-1 font-medium text-accent-strong">
              <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
              Realizado: {formatMoney(movement.amount, symbol)}
            </p>
            <p className="text-muted-foreground">
              {formatDay(movement.date)} · {movement.payment_method}
            </p>
            <Difference item={item} symbol={symbol} />
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
            <CircleDashed aria-hidden="true" className="h-4 w-4 shrink-0" />
            Pendiente
          </p>
        )}
      </div>

      {(hasList || lines) && (
        <section aria-label="Lista del supermercado">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart aria-hidden="true" className="h-4 w-4 text-primary" />
            Lista (precios en dólares)
          </h3>
          {editable ? (
            <>
              <ShoppingListEditor
                lines={lines}
                onChange={changeLines}
                errors={lineErrors}
                usdSymbol={usdSymbol}
              />
              {listError && <Alert className="mt-2">{listError}</Alert>}
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <p role="status" className="text-sm text-accent-strong sm:mr-auto">
                  {saved && (
                    <span className="inline-flex items-center gap-1">
                      <CircleCheck aria-hidden="true" className="h-4 w-4" />
                      Lista guardada
                    </span>
                  )}
                </p>
                {!hasList && (
                  <Button variant="secondary" disabled={saving} onClick={() => setLines(null)}>
                    Cancelar
                  </Button>
                )}
                <Button loading={saving} onClick={saveList}>
                  Guardar lista
                </Button>
              </div>
            </>
          ) : (
            <>
              <ReadOnlyList list={item.shopping_list} usdSymbol={usdSymbol} />
              {canEdit && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Para cambiar la lista, deshaz la partida.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {!movement && (
            <Button icon={CircleCheck} onClick={() => onRealize(item)}>
              Marcar como realizado
            </Button>
          )}
          {movement?.can_undo && (
            <Button variant="secondary" icon={Undo2} onClick={() => onUndo(item)}>
              Deshacer
            </Button>
          )}
          {editable && !lines && (
            <Button variant="secondary" icon={ShoppingCart} onClick={() => setLines([emptyLine()])}>
              Agregar lista
            </Button>
          )}
          <Button variant="secondary" icon={Pencil} onClick={() => onEdit(item)}>
            Corregir
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => onRemove(item)}>
            Quitar
          </Button>
        </div>
      )}
    </div>
  );
}
