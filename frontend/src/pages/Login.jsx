import { useAnimationControls } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import AuthShell from "../components/AuthShell.jsx";
import Button from "../components/Button.jsx";
import Field from "../components/Field.jsx";
import { apiPost, readErrors } from "../lib/api.js";
import { shake } from "../lib/motion.js";

export default function Login() {
  const { setUser } = useAuth();
  const shakeControls = useAnimationControls();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSending(true);
    setError("");

    try {
      const { ok, data } = await apiPost("/auth/login/", { email, password });
      if (ok) {
        // Al haber usuario, App nos lleva sola a la pantalla de inicio.
        setUser(data);
        return;
      }
      setError(readErrors(data).general || "No se pudo iniciar sesión.");
      shakeControls.start(shake);
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  }

  return (
    <AuthShell
      title="Bienvenido"
      subtitle="Entra para ver las finanzas de tu familia."
      controls={shakeControls}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}

        <Field
          label="Correo"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" loading={sending} className="w-full">
          Entrar
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        ¿Tu familia aún no tiene cuenta?{" "}
        <Link to="/registro" className="inline-block py-3 font-semibold text-primary hover:underline">
          Créala aquí
        </Link>
      </p>
    </AuthShell>
  );
}
