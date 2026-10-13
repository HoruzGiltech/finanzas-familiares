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
import { useFocusFirstError } from "../lib/useFocusFirstError.js";

const EMPTY_FORM = { full_name: "", family_name: "", email: "", password: "" };

export default function Register() {
  const { setUser } = useAuth();
  const shakeControls = useAnimationControls();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useFocusFirstError(fieldErrors);

  // Devuelve las propiedades comunes de un campo: valor, cambio y error.
  function field(name) {
    return {
      value: form[name],
      error: fieldErrors[name],
      onChange: (event) => setForm({ ...form, [name]: event.target.value }),
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    setFieldErrors({});

    try {
      const { ok, data } = await apiPost("/auth/register/", form);
      if (ok) {
        setUser(data);
        return;
      }
      const errors = readErrors(data);
      setFieldErrors(errors.fields);
      setError(errors.general);
      shakeControls.start(shake);
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  }

  return (
    <AuthShell
      title="Crea tu familia"
      subtitle="Serás el administrador y podrás invitar a los demás."
      controls={shakeControls}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}

        <Field label="Tu nombre" autoComplete="name" required {...field("full_name")} />
        <Field
          label="Nombre de la familia"
          placeholder="Familia Pérez"
          required
          {...field("family_name")}
        />
        <Field label="Correo" type="email" autoComplete="email" required {...field("email")} />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          hint="Mínimo 8 caracteres, y que no sea solo números."
          required
          {...field("password")}
        />

        <Button type="submit" loading={sending} className="w-full">
          Crear familia
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link to="/entrar" className="inline-block py-3 font-semibold text-primary hover:underline">
          Entra aquí
        </Link>
      </p>
    </AuthShell>
  );
}
