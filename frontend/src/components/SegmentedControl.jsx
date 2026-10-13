// Grupo de botones donde siempre hay uno elegido: "Todos | Ingresos | Gastos".
// options = [{ value, label }]
export default function SegmentedControl({ label, options, value, onChange, className = "" }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-1 rounded-lg bg-muted p-1 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={
              "min-h-11 flex-1 cursor-pointer rounded-md px-3 text-sm font-semibold " +
              "transition-colors duration-150 " +
              (selected
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
