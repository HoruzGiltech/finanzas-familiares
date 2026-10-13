// Botón que solo muestra un icono. `label` es obligatorio: es lo que oye quien
// usa lector de pantalla.
export default function IconButton({ icon: Icon, label, danger = false, className = "", ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={
        "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg " +
        "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 " +
        (danger
          ? "text-danger hover:bg-danger-soft"
          : "text-muted-foreground hover:bg-muted") +
        ` ${className}`
      }
      {...props}
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
