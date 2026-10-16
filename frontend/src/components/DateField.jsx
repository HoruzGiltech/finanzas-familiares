import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";

import { maskTypedDate, parseTypedDate, shiftDay, toTypedDate, today } from "../lib/format.js";
import Button from "./Button.jsx";
import Field from "./Field.jsx";

// Revisa una fecha escrita: devuelve { date: "2026-10-15" } o { error: "..." }.
export function checkTypedDate(text) {
  if (!text.trim()) return { error: "Escribe la fecha." };
  const date = parseTypedDate(text);
  if (!date) return { error: "Escribe una fecha válida, como 15/10/2026 (día/mes/año)." };
  if (date > today()) return { error: "La fecha no puede ser futura." };
  return { date };
}

// Fecha en dd/mm/aaaa (spec 004, ajuste): campo de texto con las barras
// automáticas, botones Hoy y Ayer, y el calendario del navegador para otro día.
// `value` es el texto tal como se escribe ("15/10/2026"). Sin `quickDays`, no
// hay botones Hoy y Ayer (el rango de la exportación tiene sus propios atajos).
export default function DateField({ label = "Fecha", value, onChange, error, quickDays = true }) {
  const calendar = useRef(null); // el calendario oculto del navegador
  const [calendarError, setCalendarError] = useState("");

  function openCalendar() {
    try {
      calendar.current.showPicker();
    } catch {
      // Navegadores antiguos sin showPicker: queda escribir la fecha a mano.
      setCalendarError("Este navegador no abre el calendario: escribe la fecha.");
    }
  }

  return (
    <div>
      <div className="flex items-start gap-2">
        <Field
          label={label}
          inputMode="numeric" // teclado numérico en el móvil; las barras se ponen solas
          placeholder="dd/mm/aaaa"
          hint="Día/mes/año, por ejemplo 15/10/2026."
          autoComplete="off"
          value={value}
          error={error || calendarError}
          onChange={(event) => onChange(maskTypedDate(event.target.value))}
          className="min-w-0 flex-1"
        />
        {/* Para cualquier otro día: el calendario del navegador. Solo se usa para
            elegir; lo elegido se escribe en el campo como dd/mm/aaaa. El campo
            oculto va junto al botón para que el calendario se abra ahí.
            mt-6: a la altura del campo, bajo su etiqueta. */}
        <div className="relative mt-6 shrink-0">
          <Button
            variant="secondary"
            icon={CalendarDays}
            onClick={openCalendar}
            aria-label={`${label}: elegir en el calendario`}
            className="min-w-11"
          >
            {/* En móvil solo el icono, para que quepa junto al campo. */}
            <span className="hidden sm:inline">Calendario</span>
          </Button>
          <input
            ref={calendar}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            max={today()}
            value={parseTypedDate(value) ?? ""}
            onChange={(event) => event.target.value && onChange(toTypedDate(event.target.value))}
            className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
          />
        </div>
      </div>
      {quickDays && (
        <div className="mt-2 flex gap-2">
          {[
            ["Hoy", today()],
            ["Ayer", shiftDay(today(), -1)],
          ].map(([label, date]) => (
            <Button
              key={label}
              variant="secondary"
              aria-pressed={value === toTypedDate(date)}
              onClick={() => onChange(toTypedDate(date))}
              className="aria-pressed:border-primary aria-pressed:text-primary"
            >
              {label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
