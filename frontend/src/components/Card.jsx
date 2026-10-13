// Superficie blanca con borde y sombra suave.
export default function Card({ className = "", children }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
