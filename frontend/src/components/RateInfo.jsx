import { formatDay } from "../lib/format.js";
import { rateNotice, rateSummary } from "../lib/rates.js";
import Alert from "./Alert.jsx";

// Aviso cuando la tasa no es la de hoy (fin de semana, BCV caído o sin tasa).
export function RateNotice({ rate, symbols, className = "" }) {
  const notice = rateNotice(rate, symbols);
  return notice ? (
    <Alert kind="warning" className={className}>
      {notice}
    </Alert>
  ) : null;
}

// La tasa que se está usando y, si hace falta, el aviso.
export default function RateInfo({ rate, symbols }) {
  return (
    <div className="mt-3 space-y-3">
      {rate.status === "current" && (
        <p className="text-sm text-muted-foreground">
          Tasa BCV del {formatDay(rate.date).toLowerCase()}: {rateSummary(rate, symbols)}
        </p>
      )}
      <RateNotice rate={rate} symbols={symbols} />
    </div>
  );
}
