import { Check, Copy } from "lucide-react";
import { useState } from "react";

import Alert from "./Alert.jsx";
import Button from "./Button.jsx";

// Muestra una contraseña temporal recién creada. Solo se ve esta vez.
export default function TemporaryPassword({ member, password, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Entrégale esta contraseña a <strong>{member.full_name}</strong>. Deberá
        cambiarla la primera vez que entre con su correo ({member.email}).
      </p>

      <div className="flex items-center gap-2">
        <code className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-base break-all">
          {password}
        </code>
        <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>

      <Alert kind="info">No se volverá a mostrar. Cópiala antes de cerrar.</Alert>

      <Button className="w-full" onClick={onClose}>
        Listo
      </Button>
    </div>
  );
}
