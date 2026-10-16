import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

const CONTROL =
  "min-h-11 w-full rounded-lg border bg-card px-3 text-base text-foreground " +
  "transition-colors duration-150 placeholder:text-muted-foreground/70";

// Campo de formulario: etiqueta visible, ayuda opcional y error junto al campo.
// Con options={[{ value, label }]} se dibuja una lista desplegable.
// Con type="password" lleva un botón para ver lo que se escribe (ajuste de la spec 002).
export default function Field({ label, error, hint, options, className = "", ...props }) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = props.type === "password";
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
      ) : isPassword ? (
        <div className="relative">
          {/* pr-12: que el texto no quede debajo del botón. */}
          <input
            {...controlProps}
            type={showPassword ? "text" : "password"}
            className={`${controlProps.className} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            aria-controls={id}
            className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Eye aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
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
