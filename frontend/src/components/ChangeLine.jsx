import { ArrowDown, ArrowUp, Equal } from "lucide-react";

// Cambio frente al mes anterior bajo una cifra: "▲ 12 % vs. septiembre" (spec 007).
// `percent` es texto ("12.0", "-10.1") o null si no se puede calcular (base cero).
// `goodWhenUp`: en ingresos y balance subir es bueno; en gastos, malo.
// Siempre flecha y texto, nunca solo el color.
export default function ChangeLine({ percent, goodWhenUp, against }) {
  if (percent === null) {
    return <span className="text-muted-foreground">Sin datos de {against}</span>;
  }
  const rounded = Math.round(Math.abs(Number(percent)));
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Equal aria-hidden="true" className="h-3.5 w-3.5" />
        Igual que {against}
      </span>
    );
  }
  const up = Number(percent) > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 ${good ? "text-accent-strong" : "text-danger"}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {up ? "Subió" : "Bajó"} {rounded}&nbsp;% vs. {against}
    </span>
  );
}
