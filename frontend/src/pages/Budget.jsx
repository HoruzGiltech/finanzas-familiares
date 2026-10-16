import {
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Plus,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import BudgetItemDetail, { Difference } from "../components/BudgetItemDetail.jsx";
import BudgetItemForm from "../components/BudgetItemForm.jsx";
import BudgetProposal from "../components/BudgetProposal.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import CurrencyPicker from "../components/CurrencyPicker.jsx";
import Modal from "../components/Modal.jsx";
import MonthPicker from "../components/MonthPicker.jsx";
import RateInfo from "../components/RateInfo.jsx";
import RealizeForm from "../components/RealizeForm.jsx";
import ShoppingListForm from "../components/ShoppingListForm.jsx";
import Skeleton from "../components/Skeleton.jsx";
import StatNumber from "../components/StatNumber.jsx";
import { apiDelete, apiGet, apiPost, readErrors } from "../lib/api.js";
import { BASE, currencySymbols, saveCurrency, savedCurrency } from "../lib/currency.js";
import {
  currentMonth,
  formatDay,
  formatMoney,
  formatMonthName,
  shiftMonth,
} from "../lib/format.js";
import {
  duration,
  ease,
  fadeIn,
  layoutTransition,
  listItem,
  slideUp,
  staggerList,
} from "../lib/motion.js";

// "2026-10-02" -> "02/10", para que el detalle quepa en una línea.
const shortDate = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

// Un renglón por partida (spec 011): el círculo la marca como realizada; el
// resto del renglón abre su detalle con las demás acciones.
function ItemRow({ item, symbol, canEdit, onRealize, onOpen }) {
  const movement = item.movement;
  const products = item.shopping_list.length;
  const StatusIcon = movement ? CircleCheck : canEdit ? Circle : CircleDashed;
  const statusClass = `h-5 w-5 ${movement ? "text-accent-strong" : "text-muted-foreground"}`;

  return (
    <div className="flex items-start">
      {canEdit && !movement ? (
        <button
          type="button"
          onClick={() => onRealize(item)}
          aria-label={`Marcar ${item.description} como realizado`}
          title="Marcar como realizado"
          className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150 hover:bg-accent-soft"
        >
          <StatusIcon aria-hidden="true" className={statusClass} />
        </button>
      ) : (
        <span className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
          <StatusIcon aria-hidden="true" className={statusClass} />
          <span className="sr-only">{movement ? "Realizada:" : "Pendiente:"}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="-mr-2 flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 text-left transition-colors duration-150 hover:bg-muted/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 font-medium break-words">{item.description}</span>
            <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
              <span className="sr-only">Previsto: </span>
              {formatMoney(item.amount, symbol)}
            </span>
          </span>
          {/* Sin grupos, la categoría va siempre en la línea de detalle. */}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{item.category.name}</span>
            {products > 0 && (
              <span className="inline-flex items-center gap-1">
                <ShoppingCart aria-hidden="true" className="h-3.5 w-3.5" />
                {products} {products === 1 ? "producto" : "productos"}
              </span>
            )}
            {movement && (
              <span>
                Real {formatMoney(movement.amount, symbol)} · {shortDate(movement.date)} ·{" "}
                {movement.payment_method}
              </span>
            )}
            {movement && <Difference item={item} symbol={symbol} />}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

// Una cifra del resumen: etiqueta pequeña y el monto que cuenta.
function Figure({ icon: Icon, label, value, symbol, tone = "", className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${tone}`} />
        {label}
      </p>
      <p className={`font-semibold whitespace-nowrap sm:text-lg ${tone}`}>
        <StatNumber value={value} format={(number) => formatMoney(number, symbol)} />
      </p>
    </div>
  );
}

// El resumen en una sola tarjeta (spec 011). En el móvil, lo presupuestado
// ocupa su fila y realizado y pendiente van debajo, para que quepan las cifras
// largas en bolívares; desde 640 px, las tres en una fila.
function Summary({ totals, symbol }) {
  const planned = Number(totals.planned);
  const share = planned > 0 ? Math.min(Number(totals.done) / planned, 1) : 0;
  return (
    <motion.div variants={slideUp}>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Figure
            icon={ClipboardList}
            label="Presupuestado"
            value={totals.planned}
            symbol={symbol}
            className="col-span-2 sm:col-span-1"
          />
          <Figure
            icon={CircleCheck}
            label="Realizado"
            value={totals.done}
            symbol={symbol}
            tone="text-accent-strong"
          />
          <Figure icon={CircleDashed} label="Pendiente" value={totals.pending} symbol={symbol} />
        </div>
        {planned > 0 && (
          <div className="mt-3">
            {/* La barra crece con scaleX (solo transform). */}
            <div className="h-2 rounded-full bg-muted" aria-hidden="true">
              <motion.div
                className="h-full origin-left rounded-full bg-accent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: share }}
                transition={{ duration: duration.slow, ease }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Realizado el {Math.round(share * 100)}&nbsp;% de lo presupuestado.
            </p>
          </div>
        )}
        {Number(totals.unplanned) > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Gastos fuera del presupuesto:{" "}
            <strong className="text-foreground">{formatMoney(totals.unplanned, symbol)}</strong>
          </p>
        )}
      </Card>
    </motion.div>
  );
}

export default function Budget() {
  const { user } = useAuth();
  // El mismo permiso que registrar movimientos; la API lo vuelve a comprobar.
  const canEdit = user.role !== "viewer";

  const [month, setMonth] = useState(currentMonth());
  const [currency, setCurrency] = useState(() => savedCurrency(user.family.view_currency));
  const [catalogs, setCatalogs] = useState(null);
  const [data, setData] = useState(null); // null = cargando el mes
  const [loadError, setLoadError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [reloads, setReloads] = useState(0); // sube para volver a pedir el mes

  const [form, setForm] = useState(null); // { item } al agregar (item null) o corregir
  const [listOpen, setListOpen] = useState(false); // "Lista del supermercado"
  const [detailId, setDetailId] = useState(null); // la partida cuyo detalle está abierto
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
    saveCurrency(code, user.family.view_currency);
  }

  function reload() {
    setReloads((count) => count + 1);
  }

  function ask(kind, item) {
    setConfirmError("");
    setConfirming({ kind, item });
  }

  // Las acciones del detalle lo cierran y abren su propia ventana.
  const fromDetail = (action) => (item) => {
    setDetailId(null);
    action(item);
  };

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
  // El detalle se busca en los datos: así, al guardar la lista, se ve lo nuevo.
  const detailItem = detailId && data?.items.find((item) => item.id === detailId);

  return (
    // pb-16 en móvil: sitio para el botón flotante, que no debe tapar la última partida.
    <section className={canEdit ? "pb-16 sm:pb-0" : ""}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Presupuesto</h1>
          <p className="mt-1 text-muted-foreground">
            Lo que piensan gastar en el mes y lo que ya se hizo.
          </p>
        </div>
        {canEdit && catalogs && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              icon={ShoppingCart}
              aria-label="Lista del supermercado"
              onClick={() => setListOpen(true)}
            >
              {/* En el móvil, corto para que quepa junto al título. */}
              <span className="sm:hidden">Lista</span>
              <span className="max-sm:hidden">Lista del supermercado</span>
            </Button>
            <Button icon={Plus} className="max-sm:hidden" onClick={() => setForm({ item: null })}>
              Agregar partida
            </Button>
          </div>
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
          <Skeleton className="h-28" />
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
          <Summary totals={data.totals} symbol={symbol} />

          {data.items.length === 0 ? (
            <motion.div variants={fadeIn} className="mt-3">
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
            <motion.div variants={slideUp} className="mt-3">
              {/* Sin agrupar: de mayor a menor, como llegan de la API. */}
              <Card className="px-4 py-2 sm:px-5">
                <h2 className="sr-only">Partidas</h2>
                <ul className="relative divide-y divide-border">
                  <AnimatePresence mode="popLayout">
                    {data.items.map((item, index) => (
                      <motion.li
                        key={item.id}
                        layout
                        variants={listItem}
                        custom={index}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={layoutTransition}
                        className="py-1"
                      >
                        <ItemRow
                          item={item}
                          symbol={symbol}
                          canEdit={canEdit}
                          onRealize={setRealizing}
                          onOpen={(chosen) => setDetailId(chosen.id)}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>
            </motion.div>
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
        {detailItem && (
          <Modal title={detailItem.description} onClose={() => setDetailId(null)}>
            <BudgetItemDetail
              item={detailItem}
              symbol={symbol}
              usdSymbol={symbols[BASE]}
              canEdit={canEdit}
              onRealize={fromDetail(setRealizing)}
              onEdit={fromDetail((chosen) => setForm({ item: chosen }))}
              onRemove={fromDetail((chosen) => ask("remove", chosen))}
              onUndo={fromDetail((chosen) => ask("undo", chosen))}
              onListSaved={reload}
            />
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {listOpen && (
          <Modal title="Lista del supermercado" onClose={() => setListOpen(false)}>
            <ShoppingListForm
              month={month}
              catalogs={catalogs}
              usdSymbol={symbols[BASE]}
              onSaved={() => {
                setListOpen(false);
                reload();
              }}
              onCancel={() => setListOpen(false)}
            />
          </Modal>
        )}
      </AnimatePresence>

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
              symbol={symbol}
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
                {confirming.item.shopping_list.length > 0 && " Su lista se borra con ella."}
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
