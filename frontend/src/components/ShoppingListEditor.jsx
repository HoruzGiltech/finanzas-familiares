import { Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";

import { formatMoney } from "../lib/format.js";
import { listItem } from "../lib/motion.js";
import { amountForApi } from "./AmountField.jsx";
import IconButton from "./IconButton.jsx";
import StatNumber from "./StatNumber.jsx";

// La lista del supermercado de una partida (spec 011). Los precios se escriben
// en USD. Cada producto es { key, name, quantity, unit_price }, como texto tal
// cual se escribe ("1,80"); el total que vale lo calcula el backend.

let nextKey = 0;
export function emptyLine() {
  nextKey += 1;
  return { key: nextKey, name: "", quantity: "1", unit_price: "" };
}

// "1.80" -> "1,80": como se escribe aquí.
const typed = (number) => number.replace(".", ",");

// De la API a la lista que se edita, con un renglón vacío al final para seguir.
export function linesFromApi(shoppingList) {
  return [
    ...shoppingList.map((line) => ({
      ...emptyLine(),
      name: line.name,
      quantity: typed(line.quantity).replace(/,00$/, ""), // "4,00" -> "4"
      unit_price: typed(line.unit_price),
    })),
    emptyLine(),
  ];
}

const isBlank = (line) => !line.name.trim() && !line.unit_price.trim();

// Prepara la lista para la API. Los renglones vacíos se ignoran.
// Devuelve { lines, sent, errors }: `sent` son los renglones enviados (para
// poner junto a cada uno el error que devuelva la API) y `errors`, por key.
export function linesForApi(lines) {
  const sent = lines.filter((line) => !isBlank(line));
  const errors = {};
  for (const line of sent) {
    if (!line.name.trim()) errors[line.key] = "Escribe el producto.";
    else if (!line.unit_price.trim()) errors[line.key] = "Escribe el precio.";
    else if (!line.quantity.trim()) errors[line.key] = "Escribe la cantidad.";
  }
  if (sent.length === 0) errors.general = "Agrega al menos un producto.";
  return {
    sent,
    errors,
    lines: sent.map((line) => ({
      name: line.name.trim(),
      quantity: amountForApi(line.quantity),
      unit_price: amountForApi(line.unit_price),
    })),
  };
}

// Los errores de la API ({ shopping_list: [{...}, {}, ...] o ["mensaje"] }), por key.
export function apiListErrors(data, sent) {
  const errors = {};
  const list = data?.shopping_list;
  if (!list) return errors;
  if (!Array.isArray(list) || typeof list[0] === "string") {
    errors.general = [].concat(list).join(" ");
    return errors;
  }
  list.forEach((fields, index) => {
    const message = Object.values(fields ?? {})
      .flat()
      .join(" ");
    if (message && sent[index]) errors[sent[index].key] = message;
  });
  return errors;
}

// Cantidad × precio, solo para enseñarlo mientras se escribe (en céntimos, para
// no arrastrar errores de coma flotante). null si falta algo.
function lineCents(line) {
  const quantity = Number(amountForApi(line.quantity));
  const price = Number(amountForApi(line.unit_price));
  if (!line.unit_price.trim() || !Number.isFinite(quantity) || !Number.isFinite(price)) {
    return null;
  }
  return Math.round(quantity * price * 100);
}

const INPUT =
  "min-h-11 w-full rounded-lg border bg-card px-3 text-base text-foreground " +
  "transition-colors duration-150 placeholder:text-muted-foreground/70";

export default function ShoppingListEditor({ lines, onChange, errors = {}, usdSymbol }) {
  const listRef = useRef(null);

  function update(changed) {
    const updated = lines.map((line) => (line.key === changed.key ? changed : line));
    // Al empezar a escribir en el último renglón aparece otro vacío debajo.
    if (!isBlank(updated.at(-1))) updated.push(emptyLine());
    onChange(updated);
  }

  function remove(key) {
    const remaining = lines.filter((line) => line.key !== key);
    onChange(remaining.length > 0 ? remaining : [emptyLine()]);
  }

  // Enter salta al campo siguiente, para escribir la lista rápido en el móvil.
  function nextField(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const inputs = [...listRef.current.querySelectorAll("input")];
    inputs[inputs.indexOf(event.target) + 1]?.focus();
  }

  const totalCents = lines.reduce((sum, line) => sum + (lineCents(line) ?? 0), 0);
  const count = lines.filter((line) => !isBlank(line)).length;

  return (
    <div>
      <ul ref={listRef} className="divide-y divide-border">
        <AnimatePresence initial={false}>
          {lines.map((line, index) => {
            const cents = lineCents(line);
            const error = errors[line.key];
            const border = error ? "border-danger" : "border-border";
            const last = index === lines.length - 1;
            return (
              <motion.li
                key={line.key}
                variants={listItem}
                initial="initial"
                animate="animate"
                exit="exit"
                className="py-2"
              >
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Producto {index + 1}</span>
                    <input
                      value={line.name}
                      maxLength={100}
                      placeholder={last ? "Agregar producto" : "Producto"}
                      aria-invalid={error ? "true" : undefined}
                      onChange={(event) => update({ ...line, name: event.target.value })}
                      onKeyDown={nextField}
                      enterKeyHint="next"
                      className={`${INPUT} ${border}`}
                    />
                  </label>
                  {isBlank(line) ? (
                    // Sitio de la papelera, para que los campos no bailen.
                    <span className="w-11 shrink-0" />
                  ) : (
                    <IconButton
                      icon={Trash2}
                      danger
                      label={`Quitar ${line.name || "el producto"} de la lista`}
                      onClick={() => remove(line.key)}
                    />
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="w-16 shrink-0">
                    <span className="sr-only">Cantidad de {line.name || "este producto"}</span>
                    <input
                      value={line.quantity}
                      inputMode="decimal"
                      onChange={(event) => update({ ...line, quantity: event.target.value })}
                      onKeyDown={nextField}
                      enterKeyHint="next"
                      className={`${INPUT} border-border text-right tabular-nums`}
                    />
                  </label>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ×
                  </span>
                  <label className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="text-sm text-muted-foreground">{usdSymbol}</span>
                    <span className="sr-only">
                      Precio de {line.name || "este producto"} en dólares
                    </span>
                    <input
                      value={line.unit_price}
                      inputMode="decimal"
                      placeholder="0,00"
                      onChange={(event) => update({ ...line, unit_price: event.target.value })}
                      onKeyDown={nextField}
                      enterKeyHint="next"
                      className={`${INPUT} ${border} min-w-0 text-right tabular-nums`}
                    />
                  </label>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
                    {cents === null ? "" : formatMoney(cents / 100, usdSymbol)}
                  </span>
                </div>
                {error && (
                  <p role="alert" className="mt-1 text-sm text-danger">
                    {error}
                  </p>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">
          Total · {count} {count === 1 ? "producto" : "productos"}
        </p>
        <p className="text-lg font-semibold">
          <StatNumber value={totalCents / 100} format={(value) => formatMoney(value, usdSymbol)} />
        </p>
      </div>
    </div>
  );
}
