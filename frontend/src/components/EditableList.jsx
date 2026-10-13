import { Check, Pencil, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { duration, ease, slideUp, staggerList } from "../lib/motion.js";
import Button from "./Button.jsx";
import Field from "./Field.jsx";

// Lista con alta, renombrado y activar/desactivar. La usan categorías y métodos de pago.
//
// Las tres funciones (onAdd, onRename, onToggle) devuelven una promesa con el
// mensaje de error en español, o "" si todo salió bien.
export default function EditableList({ title, addLabel, items, onAdd, onRename, onToggle }) {
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // Activos primero y, dentro de cada grupo, por orden alfabético.
  const sorted = [...items].sort(
    (a, b) => b.is_active - a.is_active || a.name.localeCompare(b.name, "es"),
  );

  async function handleAdd(event) {
    event.preventDefault();
    if (!newName.trim()) {
      setAddError("Escribe un nombre.");
      return;
    }
    setAdding(true);
    const error = await onAdd(newName);
    setAddError(error);
    if (!error) {
      setNewName("");
    }
    setAdding(false);
  }

  return (
    <div>
      <h3 className="font-semibold">{title}</h3>

      {/* En móvil el botón va debajo del campo; desde 640 px, a su lado. */}
      <form
        onSubmit={handleAdd}
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
        noValidate
      >
        <Field
          label={addLabel}
          placeholder="Nombre"
          maxLength={60}
          className="flex-1"
          value={newName}
          error={addError}
          onChange={(event) => setNewName(event.target.value)}
        />
        {/* sm:mt-6 alinea el botón con el campo, que tiene su etiqueta encima. */}
        <Button type="submit" icon={Plus} loading={adding} className="sm:mt-6">
          Agregar
        </Button>
      </form>

      <motion.ul
        variants={staggerList}
        initial="hidden"
        animate="visible"
        className="mt-3 divide-y divide-border"
      >
        {sorted.map((item) => (
          // layout: al activar o desactivar, el renglón se desliza a su nuevo sitio.
          <motion.li
            key={item.id}
            layout
            variants={slideUp}
            transition={{ layout: { duration: duration.slow, ease } }}
          >
            <Row item={item} onRename={onRename} onToggle={onToggle} />
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

function Row({ item, onRename, onToggle }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function startEditing() {
    setName(item.name);
    setError("");
    setEditing(true);
  }

  async function handleRename(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Escribe un nombre.");
      return;
    }
    setBusy(true);
    const renameError = await onRename(item, name);
    setError(renameError);
    if (!renameError) {
      setEditing(false);
    }
    setBusy(false);
  }

  async function handleToggle() {
    setBusy(true);
    setError(await onToggle(item));
    setBusy(false);
  }

  if (editing) {
    return (
      <motion.form
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: duration.fast } }}
        onSubmit={handleRename}
        className="flex flex-wrap items-start gap-2 py-2"
        noValidate
      >
        <Field
          label={`Nuevo nombre de ${item.name}`}
          maxLength={60}
          autoFocus
          className="min-w-40 flex-1"
          value={name}
          error={error}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="mt-6 flex gap-2">
          <Button type="submit" icon={Check} loading={busy}>
            Guardar
          </Button>
          <Button variant="secondary" icon={X} disabled={busy} onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </motion.form>
    );
  }

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`min-w-0 flex-1 basis-20 ${item.is_active ? "" : "text-muted-foreground"}`}>
          <span className="break-words">{item.name}</span>
          {!item.is_active && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              Desactivada
            </span>
          )}
        </p>
        <Button
          variant="secondary"
          icon={Pencil}
          disabled={busy}
          onClick={startEditing}
          aria-label={`Renombrar ${item.name}`}
          className="min-w-11"
        >
          {/* En móvil solo el lápiz, para que el renglón quepa en una línea. */}
          <span className="hidden sm:inline">Renombrar</span>
        </Button>
        <Button
          variant={item.is_active ? "danger" : "secondary"}
          loading={busy}
          onClick={handleToggle}
          aria-label={`${item.is_active ? "Desactivar" : "Activar"} ${item.name}`}
        >
          {item.is_active ? "Desactivar" : "Activar"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
