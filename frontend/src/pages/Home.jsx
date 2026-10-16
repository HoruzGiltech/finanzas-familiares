import {
  ArrowRight,
  ChartNoAxesColumn,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import BarList from "../components/BarList.jsx";
import Card from "../components/Card.jsx";
import CategoryChanges from "../components/CategoryChanges.jsx";
import ChangeLine from "../components/ChangeLine.jsx";
import CurrencyPicker from "../components/CurrencyPicker.jsx";
import DailyChart from "../components/DailyChart.jsx";
import MonthPicker from "../components/MonthPicker.jsx";
import MonthlyChart from "../components/MonthlyChart.jsx";
import RateInfo from "../components/RateInfo.jsx";
import Skeleton from "../components/Skeleton.jsx";
import TotalCard from "../components/TotalCard.jsx";
import { apiGet, readErrors } from "../lib/api.js";
import { BASE, currencySymbols, saveCurrency, savedCurrency } from "../lib/currency.js";
import { currentMonth, formatDay, formatMoney, formatMonthName } from "../lib/format.js";
import { slideUp, staggerList } from "../lib/motion.js";

const linkClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 " +
  "text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover";

// "Gastaste el 70 % de lo que entró". Nada si no hubo ingresos.
function spendingLine(totals) {
  const income = Number(totals.income);
  const expense = Number(totals.expense);
  if (income === 0) return null;
  if (expense > income) return "Gastaste más de lo que entró.";
  return `Gastaste el ${Math.round((expense / income) * 100)} % de lo que entró.`;
}

// Contra qué se compara: "septiembre" o, en el mes en curso, "1–15 de septiembre".
function comparedWith(comparison) {
  const name = formatMonthName(comparison.previous.month);
  return comparison.partial_until ? `1–${comparison.partial_until} de ${name}` : name;
}

// Bloque del dashboard: tarjeta con título que entra con los demás.
function Block({ title, className = "", children }) {
  return (
    <motion.div variants={slideUp} className={className}>
      <Card className="h-full p-4 sm:p-5">
        {title && <h2 className="mb-3 font-semibold">{title}</h2>}
        {children}
      </Card>
    </motion.div>
  );
}

function EmptyMonth({ icon: Icon, title, text, action }) {
  return (
    <Block>
      <div className="py-4 text-center">
        <Icon aria-hidden="true" className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        {action}
      </div>
    </Block>
  );
}

function TopExpenses({ expenses, month, symbol }) {
  return (
    <ul className="divide-y divide-border">
      {expenses.map((expense) => (
        <li key={expense.id}>
          <Link
            to={`/movimientos?mes=${month}`}
            className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{expense.category.name}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {formatDay(expense.date)}
                {expense.description && ` · ${expense.description}`}
              </span>
            </span>
            <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
              <span className="sr-only">Gasto de </span>
              {formatMoney(expense.amount, symbol, "−")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Dashboard({ data, symbol, canAdd }) {
  const { totals, month, comparison } = data;
  // La línea de cambio bajo cada cifra (spec 007), si hay mes anterior.
  const previous = comparison.previous;
  const change = (key, goodWhenUp) =>
    previous && (
      <ChangeLine
        percent={previous.change[key]}
        goodWhenUp={goodWhenUp}
        against={comparedWith(comparison)}
      />
    );
  const line = spendingLine(totals);
  const noMovements = Number(totals.income) === 0 && Number(totals.expense) === 0;

  return (
    // key: al cambiar de mes o de moneda todo vuelve a entrar y a dibujarse.
    <motion.div
      key={`${month}-${data.currency}`}
      variants={staggerList}
      initial="hidden"
      animate="visible"
      className="mt-4 space-y-3"
    >
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <TotalCard
          icon={TrendingUp}
          label="Ingresos"
          value={totals.income}
          format={(value) => formatMoney(value, symbol, "+")}
          tone="text-accent-strong"
          detail={change("income", true)}
        />
        <TotalCard
          icon={TrendingDown}
          label="Gastos"
          value={totals.expense}
          format={(value) => formatMoney(value, symbol, "−")}
          tone="text-danger"
          detail={change("expense", false)}
        />
        <TotalCard
          icon={Scale}
          label="Balance"
          value={totals.balance}
          format={(value) => formatMoney(value, symbol)}
          tone={Number(totals.balance) < 0 ? "text-danger" : ""}
          detail={change("balance", true)}
        />
      </div>
      {line && (
        <motion.p variants={slideUp} className="text-sm text-muted-foreground">
          {line}
        </motion.p>
      )}

      {noMovements ? (
        <EmptyMonth
          icon={Wallet}
          title="Este mes no hay movimientos"
          text={
            canAdd
              ? "Anota el primero y empieza a ver a dónde va el dinero."
              : "Cuando alguien de la familia anote uno, aparecerá aquí."
          }
          action={
            canAdd && (
              <Link to="/movimientos" className={`${linkClass} mt-4`}>
                Registrar movimiento
              </Link>
            )
          }
        />
      ) : data.by_category.length === 0 ? (
        <EmptyMonth
          icon={ChartNoAxesColumn}
          title="Este mes no hay gastos anotados"
          text="Cuando se anote un gasto, aquí verás en qué se va el dinero."
        />
      ) : (
        // En el móvil, uno debajo de otro en este orden. En escritorio, en dos
        // columnas: categorías junto a "Qué cambió", los gráficos de columnas a
        // todo el ancho, y métodos de pago junto a los gastos más grandes.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Block title="Gastos por categoría">
            <BarList
              items={data.by_category}
              symbol={symbol}
              noun="categorías"
              linkTo={(item) => `/movimientos?mes=${month}&categoria=${item.id}`}
            />
          </Block>
          <Block title="Qué cambió">
            <CategoryChanges
              categories={comparison.categories}
              partialUntil={comparison.partial_until}
              month={month}
              symbol={symbol}
            />
          </Block>
          <Block className="sm:col-span-2">
            <MonthlyChart history={comparison.history} symbol={symbol} />
          </Block>
          <Block className="sm:col-span-2">
            <DailyChart title="Gastos por día" month={month} days={data.by_day} symbol={symbol} />
          </Block>
          <Block title="Gastos por método de pago">
            <BarList items={data.by_payment_method} symbol={symbol} noun="métodos" />
          </Block>
          <Block title="Los gastos más grandes">
            <TopExpenses expenses={data.top_expenses} month={month} symbol={symbol} />
          </Block>
        </div>
      )}
    </motion.div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const canAdd = user.role !== "viewer";
  const firstName = user.full_name.split(" ")[0];

  const [month, setMonth] = useState(currentMonth());
  const [currency, setCurrency] = useState(savedCurrency);
  const [catalogs, setCatalogs] = useState(null);
  const [data, setData] = useState(null); // null = cargando el mes
  const [loadError, setLoadError] = useState("");
  // Aparte: si falla el catálogo, que una respuesta buena del mes no borre el aviso.
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    apiGet("/catalogs/")
      .then(({ ok, data: body }) => {
        if (ok) {
          setCatalogs(body);
        } else {
          setCatalogError(readErrors(body).general || "No se pudieron cargar las monedas.");
        }
      })
      .catch((err) => setCatalogError(err.message));
  }, []);

  useEffect(() => {
    // Si se cambia de mes antes de que llegue la respuesta, la vieja se ignora.
    let ignore = false;
    // El resumen del mes (spec 006) y la comparación con los anteriores (spec 007).
    const query = `?month=${month}&currency=${currency}`;
    Promise.all([apiGet(`/movements/summary/${query}`), apiGet(`/movements/comparison/${query}`)])
      .then(([summary, comparison]) => {
        if (ignore) return;
        const failed = [summary, comparison].find((response) => !response.ok);
        if (!failed) {
          setData({ ...summary.data, comparison: comparison.data });
          setLoadError("");
        } else if (failed.data?.currency && currency !== BASE) {
          // Sin tasa del BCV (o moneda desactivada): se vuelve a dólares.
          changeCurrency(BASE);
        } else {
          setLoadError(readErrors(failed.data).general || "No se pudo cargar el resumen del mes.");
        }
      })
      .catch((err) => {
        if (!ignore) setLoadError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [month, currency]);

  function changeMonth(newMonth) {
    setData(null);
    setMonth(newMonth);
  }

  function changeCurrency(code) {
    setData(null);
    setCurrency(code);
    saveCurrency(code);
  }

  const symbols = currencySymbols(catalogs);
  const ready = data && catalogs;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Hola, {firstName}</h1>
          <p className="mt-1 text-muted-foreground">Así va el mes de {user.family.name}.</p>
        </div>
        <Link to="/movimientos" className={`${linkClass} max-sm:hidden`}>
          {canAdd ? "Registrar movimiento" : "Ver movimientos"}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
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
        <div className="mt-4 space-y-3" aria-label="Cargando el resumen del mes">
          <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
            <Skeleton className="h-13 sm:h-20" />
            <Skeleton className="h-13 sm:h-20" />
            <Skeleton className="h-13 sm:h-20" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64 max-sm:hidden" />
          </div>
          <Skeleton className="h-56" />
        </div>
      )}

      {ready && <Dashboard data={data} symbol={symbols[data.currency]} canAdd={canAdd} />}

      {ready && (
        <Link
          to="/movimientos"
          className="mt-4 flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-primary sm:hidden"
        >
          Ver todos los movimientos
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      )}
    </section>
  );
}
