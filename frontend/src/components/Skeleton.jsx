// Bloque gris que late mientras llegan los datos.
// motion-safe: solo late si la persona no pidió "reducir movimiento".
export default function Skeleton({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-lg bg-muted motion-safe:animate-pulse ${className}`}
    />
  );
}
