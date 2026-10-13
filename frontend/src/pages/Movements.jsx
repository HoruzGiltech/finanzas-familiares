import { Plus, Scale, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Modal from "../components/Modal.jsx";
import MonthPicker from "../components/MonthPicker.jsx";
import MovementForm from "../components/MovementForm.jsx";
import MovementList from "../components/MovementList.jsx";
import SegmentedControl from "../components/SegmentedControl.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { apiDelete, apiGet, readErrors } from "../lib/api.js";
import { currentMonth, formatDay, formatMoney } from "../lib/format.js";
import { fadeIn, slideUp, staggerList } from "../lib/motion.js";

const ALL = "all";

function TotalCard({ icon: Icon, label, value, tone = "", className = "" }) {
  return (
    <motion.div variants={slideUp} className={className}>
      <Card className="h-full p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon aria-hidden="true" className={`h-4 w-4 ${tone}`} />
          {label}
        </p>
        <p className={`mt-1 text-lg font-semibold whitespace-nowrap ${tone}`}>{value}</p>
      </Card>
    </motion.div>
  );
}

export default function Movements() {
  const { user } = useAuth();
  const canAdd = user.role !== "viewer";

  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState(ALL);
  const [catalogs, setCatalogs] = useState(null);
  const [data, setData] = useState(null); // null = cargando el mes
  const [loadError, setLoadError] = useState("");
  const [reloads, setReloads] = useState(0); // sube para volver a pedir el mes

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // movimiento que se corrige
  const [deleting, setDeleting] = useState(null); // movimiento que se va a borrar
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Las listas del formulario se piden una sola vez.
  useEffect(() => {
    apiGet("/catalogs/")
      .then(({ ok, data: body }) => {
        if (ok) {
          setCatalogs(body);
        } else {
          setLoadError(readErrors(body).general || "No se pudieron cargar las listas.");
        }
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    // Si se cambia de mes antes de que llegue la respuesta, la vieja se ignora.
    let ignore = false;
    apiGet(`/movements/?month=${month}`)
      .then(({ ok, data: body }) => {
        if (ignore) return;
        if (ok) {
          setData(body);
          setLoadError("");
        } else {
          setLoadError(readErrors(body).general || "No se pudieron cargar los movimientos.");
        }
      })
      .catch((err) => {
        if (!ignore) setLoadError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [month, reloads]);

  function changeMonth(newMonth) {
    setData(null);
    setMonth(newMonth);
  }

  function openForm(movement = null) {
    setEditing(movement);
    setFormOpen(true);
  }

  function handleSaved(movement) {
    setFormOpen(false);
    // Que el filtro no esconda lo que se acaba de guardar.
    if (filter !== ALL && filter !== movement.movement_type) {
      setFilter(ALL);
    }
    // Si se anotó en otro mes, vamos a ese mes para que se vea.
    const savedMonth = movement.date.slice(0, 7);
    if (savedMonth === month) {
      setReloads((count) => count + 1);
    } else {
      changeMonth(savedMonth);
    }
  }

  function askDelete(movement) {
    setDeleteError("");
    setDeleting(movement);
  }

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      const { ok, data: body } = await apiDelete(`/movements/${deleting.id}/`);
      if (ok) {
        setDeleting(null);
        setReloads((count) => count + 1);
      } else {
        setDeleteError(readErrors(body).general || "No se pudo borrar.");
      }
    } catch (err) {
      setDeleteError(err.message);
    }
    setDeleteBusy(false);
  }

  const symbol = catalogs?.currencies.find((currency) => currency.is_base)?.symbol ?? "";
  const ready = data && catalogs;
  const visible = ready
    ? data.movements.filter((movement) => filter === ALL || movement.movement_type === filter)
    : [];
  // "Ingreso" -> "Ingresos": los nombres vienen del catálogo, en singular.
  const filterOptions = [
    { value: ALL, label: "Todos" },
    ...(catalogs?.movement_types ?? []).map((type) => ({
      value: type.code,
      label: `${type.name}s`,
    })),
  ];

  return (
    // pb-16 en móvil: sitio para el botón flotante, que no debe tapar el último renglón.
    <section className="pb-16 sm:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Movimientos</h1>
          <p className="mt-1 text-muted-foreground">Ingresos y gastos de tu familia, mes a mes.</p>
        </div>
        {canAdd && catalogs && (
          <Button icon={Plus} className="max-sm:hidden" onClick={() => openForm()}>
            Registrar movimiento
          </Button>
        )}
      </div>

      <div className="mt-4">
        <MonthPicker month={month} onChange={changeMonth} />
      </div>

      {loadError && <Alert className="mt-4">{loadError}</Alert>}

      {!ready && !loadError && (
        <div className="mt-4 space-y-4" aria-label="Cargando movimientos">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="col-span-2 h-20 sm:col-span-1" />
          </div>
          <Skeleton className="h-64" />
        </div>
      )}

      {ready && (
        <>
          <motion.div
            key={month}
            variants={staggerList}
            initial="hidden"
            animate="visible"
            className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <TotalCard
              icon={TrendingUp}
              label="Ingresos"
              value={formatMoney(data.totals.income, symbol, "+")}
              tone="text-accent-strong"
            />
            <TotalCard
              icon={TrendingDown}
              label="Gastos"
              value={formatMoney(data.totals.expense, symbol, "−")}
              tone="text-danger"
            />
            <TotalCard
              icon={Scale}
              label="Balance"
              value={formatMoney(data.totals.balance, symbol)}
              tone={Number(data.totals.balance) < 0 ? "text-danger" : ""}
              className="col-span-2 sm:col-span-1"
            />
          </motion.div>

          <SegmentedControl
            label="Filtrar por tipo"
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            className="mt-4 sm:max-w-sm"
          />

          {visible.length > 0 ? (
            // key: al cambiar de mes o de filtro la lista vuelve a entrar animada.
            <MovementList
              key={`${month}-${filter}`}
              movements={visible}
              symbol={symbol}
              onEdit={openForm}
              onDelete={askDelete}
            />
          ) : (
            <motion.div
              key={`${month}-${filter}`}
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              className="mt-4"
            >
              <Card className="border-dashed text-center">
                <Wallet aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 font-semibold">No hay movimientos que mostrar</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canAdd
                    ? "Anota el primero y empieza a ver a dónde va el dinero."
                    : "Cuando alguien de la familia anote uno, aparecerá aquí."}
                </p>
                {canAdd && (
                  <Button icon={Plus} className="mt-4" onClick={() => openForm()}>
                    Registrar movimiento
                  </Button>
                )}
              </Card>
            </motion.div>
          )}
        </>
      )}

      {/* En móvil el botón flota sobre la barra de navegación, al alcance del pulgar.
          Va en un portal (fuera de la página) para que la animación de entrada de
          la página no lo mueva de sitio. */}
      {canAdd &&
        catalogs &&
        createPortal(
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 sm:hidden"
          >
            <Button icon={Plus} className="shadow-lg" onClick={() => openForm()}>
              Registrar
            </Button>
          </motion.div>,
          document.body,
        )}

      <AnimatePresence>
        {formOpen && (
          <Modal
            title={editing ? "Corregir movimiento" : "Registrar movimiento"}
            onClose={() => setFormOpen(false)}
          >
            <MovementForm
              movement={editing}
              catalogs={catalogs}
              onSaved={handleSaved}
              onCancel={() => setFormOpen(false)}
            />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleting && (
          <Modal title="Borrar movimiento" onClose={() => setDeleting(null)}>
            <p>
              Vas a borrar <strong>{deleting.category.name}</strong> de{" "}
              <strong>{formatMoney(deleting.amount, symbol)}</strong> (
              {formatDay(deleting.date).toLowerCase()}).
              No se puede deshacer.
            </p>
            {deleteError && <Alert className="mt-3">{deleteError}</Alert>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={deleteBusy} onClick={() => setDeleting(null)}>
                Cancelar
              </Button>
              <Button variant="danger" loading={deleteBusy} onClick={confirmDelete}>
                Borrar
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </section>
  );
}
