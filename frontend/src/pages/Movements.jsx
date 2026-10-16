import { Download, Plus, Scale, TrendingDown, TrendingUp, Wallet, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import CurrencyPicker from "../components/CurrencyPicker.jsx";
import ExportForm from "../components/ExportForm.jsx";
import Modal from "../components/Modal.jsx";
import MonthPicker from "../components/MonthPicker.jsx";
import MovementForm from "../components/MovementForm.jsx";
import MovementList from "../components/MovementList.jsx";
import RateInfo from "../components/RateInfo.jsx";
import SegmentedControl from "../components/SegmentedControl.jsx";
import Skeleton from "../components/Skeleton.jsx";
import TotalCard from "../components/TotalCard.jsx";
import { apiDelete, apiGet, readErrors } from "../lib/api.js";
import { currentMonth, formatDay, formatMoney } from "../lib/format.js";
import { BASE, currencySymbols, saveCurrency, savedCurrency } from "../lib/currency.js";
import { fadeIn, staggerList } from "../lib/motion.js";

const ALL = "all";

// El dashboard abre esta pantalla con ?mes=2026-10&categoria=7 (spec 006).
function monthFromUrl(text) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(text ?? "") && text <= currentMonth()
    ? text
    : currentMonth();
}

export default function Movements() {
  const { user } = useAuth();
  const canAdd = user.role !== "viewer";

  const [searchParams, setSearchParams] = useSearchParams();
  const [month, setMonth] = useState(() => monthFromUrl(searchParams.get("mes")));
  // Filtro por categoría: solo desde el dashboard, y se quita con su etiqueta.
  const categoryParam = searchParams.get("categoria");
  const categoryId = /^\d+$/.test(categoryParam ?? "") ? Number(categoryParam) : null;
  const [filter, setFilter] = useState(ALL);
  const [currency, setCurrency] = useState(savedCurrency);
  const [catalogs, setCatalogs] = useState(null);
  const [data, setData] = useState(null); // null = cargando el mes
  const [loadError, setLoadError] = useState("");
  // Aparte: si falla el catálogo, que una respuesta buena del mes no borre el aviso.
  const [catalogError, setCatalogError] = useState("");
  const [reloads, setReloads] = useState(0); // sube para volver a pedir el mes

  const [formOpen, setFormOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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
          setCatalogError(readErrors(body).general || "No se pudieron cargar las listas.");
        }
      })
      .catch((err) => setCatalogError(err.message));
  }, []);

  useEffect(() => {
    // Si se cambia de mes antes de que llegue la respuesta, la vieja se ignora.
    let ignore = false;
    const category = categoryId ? `&category=${categoryId}` : "";
    apiGet(`/movements/?month=${month}&currency=${currency}${category}`)
      .then(({ ok, data: body }) => {
        if (ignore) return;
        if (ok) {
          setData(body);
          setLoadError("");
        } else if (body?.currency && currency !== BASE) {
          // Sin tasa del BCV (o moneda desactivada): se vuelve a dólares.
          changeCurrency(BASE);
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
  }, [month, currency, categoryId, reloads]);

  function changeMonth(newMonth) {
    setData(null);
    setMonth(newMonth);
  }

  function changeCurrency(code) {
    setData(null);
    setCurrency(code);
    saveCurrency(code);
  }

  function clearCategory() {
    setData(null);
    setSearchParams({}, { replace: true });
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
    if (categoryId && movement.category.id !== categoryId) {
      clearCategory();
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

  const symbols = currencySymbols(catalogs);
  const ready = data && catalogs;
  const symbol = ready ? symbols[data.currency] : "";
  // El nombre de la categoría filtrada: del catálogo o, si ya está desactivada
  // (el catálogo de un no administrador no la trae), de sus movimientos.
  const categoryName =
    categoryId &&
    (catalogs?.categories.find((item) => item.id === categoryId)?.name ??
      data?.movements[0]?.category.name ??
      "la elegida");
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
        <div className="flex shrink-0 gap-2">
          {/* Cualquier miembro exporta, también el lector (spec 008). */}
          <Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)}>
            Exportar
          </Button>
          {canAdd && catalogs && (
            <Button icon={Plus} className="max-sm:hidden" onClick={() => openForm()}>
              Registrar movimiento
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="sm:flex-1">
          <MonthPicker month={month} onChange={changeMonth} />
        </div>
        {catalogs && (
          <CurrencyPicker
            currencies={catalogs.currencies}
            rate={data?.rate}
            value={currency}
            onChange={changeCurrency}
            className="sm:w-56"
          />
        )}
      </div>

      {ready && <RateInfo rate={data.rate} symbols={symbols} />}

      {(catalogError || loadError) && <Alert className="mt-4">{catalogError || loadError}</Alert>}

      {!ready && !catalogError && !loadError && (
        <div className="mt-4 space-y-4" aria-label="Cargando movimientos">
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            <Skeleton className="h-13 sm:h-20" />
            <Skeleton className="h-13 sm:h-20" />
            <Skeleton className="h-13 sm:h-20" />
          </div>
          <Skeleton className="h-64" />
        </div>
      )}

      {ready && (
        <>
          <motion.div
            key={`${month}-${currency}`}
            variants={staggerList}
            initial="hidden"
            animate="visible"
            className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3"
          >
            <TotalCard
              icon={TrendingUp}
              label="Ingresos"
              value={data.totals.income}
              format={(value) => formatMoney(value, symbol, "+")}
              tone="text-accent-strong"
            />
            <TotalCard
              icon={TrendingDown}
              label="Gastos"
              value={data.totals.expense}
              format={(value) => formatMoney(value, symbol, "−")}
              tone="text-danger"
            />
            <TotalCard
              icon={Scale}
              label="Balance"
              value={data.totals.balance}
              format={(value) => formatMoney(value, symbol)}
              tone={Number(data.totals.balance) < 0 ? "text-danger" : ""}
            />
          </motion.div>

          {categoryId && (
            <div className="mt-4 flex">
              <span className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-4 text-sm font-semibold text-primary">
                Categoría: {categoryName}
                <button
                  type="button"
                  onClick={clearCategory}
                  aria-label={`Quitar el filtro de ${categoryName}`}
                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 hover:bg-card"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}

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
              key={`${month}-${filter}-${currency}-${categoryId}`}
              movements={visible}
              currency={data.currency}
              symbols={symbols}
              onEdit={openForm}
              onDelete={askDelete}
            />
          ) : (
            <motion.div
              key={`${month}-${filter}-${currency}`}
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
              rate={data?.rate}
              onSaved={handleSaved}
              onCancel={() => setFormOpen(false)}
            />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {exportOpen && (
          <Modal title="Exportar movimientos" onClose={() => setExportOpen(false)}>
            <ExportForm
              month={month}
              onDone={() => setExportOpen(false)}
              onCancel={() => setExportOpen(false)}
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
              {formatDay(deleting.date).toLowerCase()}). No se puede deshacer.
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
