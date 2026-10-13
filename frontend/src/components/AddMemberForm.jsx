import { useState } from "react";

import { apiPost, readErrors } from "../lib/api.js";
import { ROLES, getRole } from "../lib/roles.js";
import { useFocusFirstError } from "../lib/useFocusFirstError.js";
import Alert from "./Alert.jsx";
import Button from "./Button.jsx";
import Field from "./Field.jsx";

// Formulario de alta de un miembro. Al crearlo avisa con onCreated(miembro).
export default function AddMemberForm({ onCreated }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "editor" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useFocusFirstError(fieldErrors);

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
      const { ok, data } = await apiPost("/members/", form);
      if (ok) {
        onCreated(data);
        return;
      }
      const errors = readErrors(data);
      setFieldErrors(errors.fields);
      setError(errors.general);
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}

      <Field label="Nombre" autoComplete="off" required {...field("full_name")} />
      <Field label="Correo" type="email" autoComplete="off" required {...field("email")} />
      <Field
        label="Rol"
        options={ROLES}
        hint={getRole(form.role).description}
        {...field("role")}
      />

      <Button type="submit" loading={sending} className="w-full">
        Agregar miembro
      </Button>
    </form>
  );
}
