import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import BudgetItemForm from "../components/BudgetItemForm.jsx";
import BudgetProposal from "../components/BudgetProposal.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import CurrencyPicker from "../components/CurrencyPicker.jsx";
import IconButton from "../components/IconButton.jsx";
import Modal from "../components/Modal.jsx";
import MonthPicker from "../components/MonthPicker.jsx";
import RateInfo from "../components/RateInfo.jsx";
import RealizeForm from "../components/RealizeForm.jsx";
import Skeleton from "../components/Skeleton.jsx";
import TotalCard from "../components/TotalCard.jsx";
import { apiDelete, apiGet, apiPost, readErrors } from "../lib/api.js";
import { BASE, currencySymbols, saveCurrency, savedCurrency } from "../lib/currency.js";
import {
  currentMonth,
  formatDay,
  formatMoney,
  formatMonthName,
  shiftMonth,
} from "../lib/format.js";
import { duration, ease, fadeIn, layoutTransition, listItem, staggerList } from "../lib/motion.js";

// Partidas agrupadas por categoría, en el orden en que llegan (por nombre).
function byCategory(items) {
  const groups = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.category.id === item.category.id) {
      last.items.push(item);
    } else {
      groups.push({ category: item.category, items: [item] });
    }
  }
  return groups;
}

// "↑ $10,00 más de lo previsto": icono y texto, no solo color.
function Difference({ item, symbol }) {
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

function ItemRow({ item, symbol, canEdit, onRealize, onEdit, onRemove, onUndo }) {
  const movement = item.movement;
  return (
    <div className="py-3">
      {/* Primera línea: qué es y cuánto se previó. */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-medium break-words">{item.description}</p>
        <p className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
          <span className="sr-only">Previsto: </span>
          {formatMoney(item.amount, symbol)}
        </p>
      </div>

      {/* Segunda línea: estado y acciones. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {movement ? (
          // En el móvil el detalle ocupa su línea y los botones bajan a la siguiente.
          <div className="min-w-0 basis-full text-sm sm:basis-0 sm:flex-1">
            <p className="flex items-center gap-1 font-medium text-accent-strong">
              <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
              Realizado: {formatMoney(movement.amount, symbol)}
            </p>
            <p className="text-muted-foreground">
              {formatDay(movement.date)} · {movement.payment_method}
            </p>
            <p className="text-sm">
              <Difference item={item} symbol={symbol} />
            </p>
          </div>
        ) : (
          <p className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap text-muted-foreground">
            <CircleDashed aria-hidden="true" className="h-4 w-4 shrink-0" />
            Pendiente
          </p>
        )}

        {canEdit && (
          <div className="ml-auto flex items-center gap-1">
            {!movement && (
              <Button variant="secondary" icon={CircleCheck} onClick={() => onRealize(item)}>
                Realizado
              </Button>
            )}
            {movement?.can_undo && (
              <Button variant="secondary" icon={Undo2} onClick={() => onUndo(item)}>
                Deshacer
              </Button>
            )}
            <IconButton
              icon={Pencil}
              label={`Corregir ${item.description}`}
              onClick={() => onEdit(item)}
            />
            <IconButton
              icon={Trash2}
              danger
              label={`Quitar ${item.description} del presupuesto`}
              onClick={() => onRemove(item)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Cuánto del presupuesto ya se realizó: barra que crece con scaleX (solo transform).
function Progress({ totals }) {
  const planned = Number(totals.planned);
  if (planned === 0) return null;
  const share = Math.min(Number(totals.done) / planned, 1);
  return (
    <div className="mt-3">
      <div className="h-2 rounded-full bg-muted" aria-hidden="true">
        <motion.div
          className="h-full origin-left rounded-full bg-accent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ duration: duration.slow, ease }}
        />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Realizado el {Math.round(share * 100)}&nbsp;% de lo presupuestado.
      </p>
    </div>
  );
}

export default function Budget() {
  const { user } = useAuth();
  // El mismo permiso que registrar movimientos; la API lo vuelve a comprobar.
  const canEdit = user.role !== "viewer";

  const [month, setMonth] = useState(currentMonth());
  const [currency, setCurrency] = useState(savedCurrency);
  const [catalogs, setCatalogs] = useState(null);
  const [data, setData] = useState(null); // null = cargando el mes
  const [loadError, setLoadError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [reloads, setReloads] = useState(0); // sube para volver a pedir el mes

  const [form, setForm] = useState(null); // { item } al agregar (item null) o corregir
  const [realizing, setRealizing] = useState(null);
  const [confirming, setConfirming] = useState(null); // { kind: "remove" | "undo", item }
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [proposing, setProposing] = useState(false);

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
    apiGet(`/budget/?month=${month}&currency=${currency}`)
      .then(({ ok, data: body }) => {
        if (ignore) return;
        if (ok) {
          setData(body);
          setLoadError("");
        } else if (body?.currency && currency !== BASE) {
          // Sin tasa del BCV (o moneda desactivada): se vuelve a dólares.
          changeCurrency(BASE);
        } else {
          setLoadError(readErrors(body).general || "No se pudo cargar el presupuesto.");
        }
      })
      .catch((err) => {
        if (!ignore) setLoadError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [month, currency, reloads]);

  function changeMonth(newMonth) {
    setData(null);
    setMonth(newMonth);
  }

  function changeCurrency(code) {
    setData(null);
    setCurrency(code);
    saveCurrency(code);
  }

  function reload() {
    setReloads((count) => count + 1);
  }

  function ask(kind, item) {
    setConfirmError("");
    setConfirming({ kind, item });
  }

  async function confirm() {
    const { kind, item } = confirming;
    setConfirmBusy(true);
    try {
      const { ok, data: body } =
        kind === "undo"
          ? await apiPost(`/budget/items/${item.id}/undo/`)
          : await apiDelete(`/budget/items/${item.id}/`);
      if (ok) {
        setConfirming(null);
        reload();
      } else {
        setConfirmError(readErrors(body).general || "No se pudo hacer.");
      }
    } catch (err) {
      setConfirmError(err.message);
    }
    setConfirmBusy(false);
  }

  const symbols = currencySymbols(catalogs);
  const ready = data && catalogs;
  const symbol = ready ? symbols[data.currency] : "";
  const previousName = formatMonthName(shiftMonth(month, -1));

  return (
    // pb-16 en móvil: sitio para el botón flotante, que no debe tapar la última partida.
    <section className={canEdit ? "pb-16 sm:pb-0" : ""}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Presupuesto</h1>
          <p className="mt-1 text-muted-foreground">
            Lo que piensan gastar en el mes y lo que ya se hizo.
          </p>
        </div>
        {canEdit && catalogs && (
          <Button icon={Plus} className="max-sm:hidden" onClick={() => setForm({ item: null })}>
            Agregar partida
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="sm:flex-1">
          {/* Se puede planificar el mes siguiente (spec 010, regla 6). */}
          <MonthPicker month={month} onChange={changeMonth} max={shiftMonth(currentMonth(), 1)} />
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
        <div className="mt-4 space-y-3" aria-label="Cargando el presupuesto">
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            <Skeleton className="h-13 sm:h-20" />
            <Skeleton className="h-13 sm:h-20" />
            <Skeleton className="h-13 sm:h-20" />
          </div>
          <Skeleton className="h-64" />
        </div>
      )}

      {ready && (
        <motion.div
          key={`${month}-${currency}`}
          variants={staggerList}
          initial="hidden"
          animate="visible"
          className="mt-4"
        >
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            <TotalCard
              icon={ClipboardList}
              label="Presupuestado"
              value={data.totals.planned}
              format={(value) => formatMoney(value, symbol)}
            />
            <TotalCard
              icon={CircleCheck}
              label="Realizado"
              value={data.totals.done}
              format={(value) => formatMoney(value, symbol)}
              tone="text-accent-strong"
            />
            <TotalCard
              icon={CircleDashed}
              label="Pendiente"
              value={data.totals.pending}
              format={(value) => formatMoney(value, symbol)}
            />
          </div>
          <Progress totals={data.totals} />
          {Number(data.totals.unplanned) > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Gastos fuera del presupuesto:{" "}
              <strong className="text-foreground">
                {formatMoney(data.totals.unplanned, symbol)}
              </strong>
            </p>
          )}

          {data.items.length === 0 ? (
            <motion.div variants={fadeIn} className="mt-4">
              <Card className="border-dashed text-center">
                <ClipboardList
                  aria-hidden="true"
                  className="mx-auto h-8 w-8 text-muted-foreground"
                />
                {data.can_propose && canEdit ? (
                  <>
                    <p className="mt-2 font-semibold">
                      Prepara el presupuesto de {formatMonthName(month)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Parte de {previousName}, con lo que realmente se gastó, y revísalo.
                    </p>
                    <Button icon={Sparkles} className="mt-4" onClick={() => setProposing(true)}>
                      Preparar a partir de {previousName}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-semibold">Este mes no tiene presupuesto</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {canEdit
                        ? "Agrega lo que piensan gastar: alquiler, mercado, servicios…"
                        : "Cuando alguien de la familia lo prepare, aparecerá aquí."}
                    </p>
                    {canEdit && (
                      <Button icon={Plus} className="mt-4" onClick={() => setForm({ item: null })}>
                        Agregar partida
                      </Button>
                    )}
                  </>
                )}
              </Card>
            </motion.div>
          ) : (
            <div className="mt-4 space-y-3">
              {byCategory(data.items).map((group) => (
                <Card key={group.category.id} className="p-4 sm:p-5">
                  <h2 className="font-semibold">{group.category.name}</h2>
                  <ul className="relative divide-y divide-border">
                    <AnimatePresence mode="popLayout">
                      {group.items.map((item, index) => (
                        <motion.li
                          key={item.id}
                          layout
                          variants={listItem}
                          custom={index}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          transition={layoutTransition}
                        >
                          <ItemRow
                            item={item}
                            symbol={symbol}
                            canEdit={canEdit}
                            onRealize={setRealizing}
                            onEdit={(chosen) => setForm({ item: chosen })}
                            onRemove={(chosen) => ask("remove", chosen)}
                            onUndo={(chosen) => ask("undo", chosen)}
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* En móvil el botón flota sobre la barra de navegación, al alcance del pulgar. */}
      {canEdit &&
        catalogs &&
        createPortal(
          <motion.div
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 sm:hidden"
          >
            <Button icon={Plus} className="shadow-lg" onClick={() => setForm({ item: null })}>
              Agregar
            </Button>
          </motion.div>,
          document.body,
        )}

      <AnimatePresence>
        {form && (
          <Modal
            title={form.item ? "Corregir partida" : "Agregar partida"}
            onClose={() => setForm(null)}
          >
            <BudgetItemForm
              item={form.item}
              month={month}
              catalogs={catalogs}
              rate={data?.rate}
              viewCurrency={currency}
              onSaved={() => {
                setForm(null);
                reload();
              }}
              onCancel={() => setForm(null)}
            />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {realizing && (
          <Modal title="Marcar como realizado" onClose={() => setRealizing(null)}>
            <RealizeForm
              item={realizing}
              catalogs={catalogs}
              rate={data?.rate}
              viewCurrency={currency}
              symbol={symbol}
              onSaved={() => {
                setRealizing(null);
                reload();
              }}
              onCancel={() => setRealizing(null)}
            />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {proposing && (
          <Modal
            title={`Presupuesto de ${formatMonthName(month)}`}
            onClose={() => setProposing(false)}
          >
            <BudgetProposal
              month={month}
              usdSymbol={symbols[BASE]}
              onCreated={() => {
                setProposing(false);
                reload();
              }}
              onCancel={() => setProposing(false)}
            />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirming && (
          <Modal
            title={confirming.kind === "undo" ? "Deshacer el gasto" : "Quitar partida"}
            onClose={() => setConfirming(null)}
          >
            {confirming.kind === "undo" ? (
              <p>
                Se borrará el gasto de <strong>{confirming.item.description}</strong> (
                {formatMoney(confirming.item.movement.amount, symbol)},{" "}
                {formatDay(confirming.item.movement.date).toLowerCase()}) de Movimientos, y la
                partida quedará pendiente.
              </p>
            ) : (
              <p>
                Vas a quitar <strong>{confirming.item.description}</strong> del presupuesto.
                {confirming.item.movement && " Su gasto se queda en Movimientos."}
              </p>
            )}
            {confirmError && <Alert className="mt-3">{confirmError}</Alert>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                disabled={confirmBusy}
                onClick={() => setConfirming(null)}
              >
                Cancelar
              </Button>
              <Button variant="danger" loading={confirmBusy} onClick={confirm}>
                {confirming.kind === "undo" ? "Deshacer" : "Quitar"}
              </Button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </section>
  );
}
