import { useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Field from "../components/Field.jsx";
import { apiPost, readErrors } from "../lib/api.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";

export default function ChangePassword() {
  const { user, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  useFocusFirstError(fieldErrors);

  async function handleSubmit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    setFieldErrors({});
    setDone(false);

    try {
      const { ok, data } = await apiPost("/auth/password/", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (ok) {
        // Si la contraseña era temporal, ahora el usuario ya puede usar toda la aplicación.
        setUser(data);
        setCurrentPassword("");
        setNewPassword("");
        setDone(true);
      } else {
        const errors = readErrors(data);
        setFieldErrors(errors.fields);
        setError(errors.general);
      }
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Cambiar contraseña</h1>

      {user.must_change_password && (
        <Alert kind="info" className="mt-4">
          Estás usando una contraseña temporal. Elige una propia para continuar.
        </Alert>
      )}

      <Card className="mt-4">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          {done && <Alert kind="success">Contraseña cambiada.</Alert>}

          <Field
            label={user.must_change_password ? "Contraseña temporal" : "Contraseña actual"}
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            error={fieldErrors.current_password}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Field
            label="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, y que no sea solo números."
            required
            value={newPassword}
            error={fieldErrors.new_password}
            onChange={(event) => setNewPassword(event.target.value)}
          />

          <Button type="submit" loading={sending} className="w-full">
            Guardar contraseña
          </Button>
        </form>
      </Card>
    </section>
  );
}
