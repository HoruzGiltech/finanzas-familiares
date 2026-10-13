import { useId } from "react";

const CONTROL =
  "min-h-11 w-full rounded-lg border bg-card px-3 text-base text-foreground " +
  "transition-colors duration-150 placeholder:text-muted-foreground/70";

// Campo de formulario: etiqueta visible, ayuda opcional y error junto al campo.
// Con options={[{ value, label }]} se dibuja una lista desplegable.
export default function Field({ label, error, hint, options, className = "", ...props }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const borderColor = error ? "border-danger" : "border-border";

  const controlProps = {
    id,
    "aria-invalid": error ? "true" : undefined,
    "aria-describedby": describedBy,
    className: `${CONTROL} ${borderColor}`,
    ...props,
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>

      {options ? (
        <select {...controlProps}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input {...controlProps} />
      )}

      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
