import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { duration, ease, listItem, slideUp, staggerList } from "../lib/motion.js";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Field from "./Field.jsx";
import IconButton from "./IconButton.jsx";
import Modal from "./Modal.jsx";

// Lista con alta, renombrado, activar/desactivar y borrar. La usan categorías y
// métodos de pago. `noun` es "categoría" o "método de pago" (para los textos).
//
// Las funciones (onAdd, onRename, onToggle, onDelete) devuelven una promesa con
// el mensaje de error en español, o "" si todo salió bien. Solo se puede borrar
// lo que ningún movimiento usa (`movement_count` 0, spec 009).
export default function EditableList({
  title,
  addLabel,
  noun,
  items,
  onAdd,
  onRename,
  onToggle,
  onDelete,
}) {
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
        <AnimatePresence initial={false}>
          {sorted.map((item) => (
            // layout: al activar o desactivar, el renglón se desliza a su nuevo
            // sitio; al borrarlo, sale hacia un lado y los demás ocupan el hueco.
            <motion.li
              key={item.id}
              layout
              variants={slideUp}
              exit={listItem.exit}
              transition={{ layout: { duration: duration.slow, ease } }}
            >
              <Row
                item={item}
                noun={noun}
                onRename={onRename}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

function Row({ item, noun, onRename, onToggle, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false); // confirmación abierta
  const [deleteError, setDeleteError] = useState("");
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

  function askDelete() {
    setDeleteError("");
    setDeleting(true);
  }

  async function confirmDelete() {
    setBusy(true);
    const error = await onDelete(item);
    // Si salió bien el renglón desaparece; si no, el error se ve en la confirmación.
    setDeleteError(error);
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
        {/* basis-32: espacio para un nombre como "Entretenimiento" sin partirlo. Si
            los botones no caben al lado, bajan juntos a la línea siguiente. */}
        <p className={`min-w-0 flex-1 basis-32 ${item.is_active ? "" : "text-muted-foreground"}`}>
          <span className="break-words">{item.name}</span>
          {!item.is_active && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              Desactivada
            </span>
          )}
          {/* Por qué no se puede borrar: lo usan movimientos. */}
          {item.movement_count > 0 && (
            <span className="block text-xs text-muted-foreground">
              {item.movement_count === 1 ? "1 movimiento" : `${item.movement_count} movimientos`}
            </span>
          )}
        </p>
        <div className="ml-auto flex gap-2">
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
          {onDelete && item.movement_count === 0 && (
            <IconButton icon={Trash2} danger label={`Borrar ${item.name}`} onClick={askDelete} />
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}

      <AnimatePresence>
        {deleting && (
          <Modal title={`Borrar ${noun}`} onClose={() => setDeleting(false)}>
            <p>
              Vas a borrar <strong>{item.name}</strong>. No tiene movimientos. No se puede deshacer.
            </p>
            {deleteError && <Alert className="mt-3">{deleteError}</Alert>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>
                Cancelar
              </Button>
              <Button variant="danger" icon={Trash2} loading={busy} onClick={confirmDelete}>
                Borrar
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
