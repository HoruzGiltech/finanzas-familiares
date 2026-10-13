import { RotateCcwKey, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext.jsx";
import AddMemberForm from "../components/AddMemberForm.jsx";
import Alert from "../components/Alert.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Modal from "../components/Modal.jsx";
import Skeleton from "../components/Skeleton.jsx";
import TemporaryPassword from "../components/TemporaryPassword.jsx";
import { apiGet, apiPatch, apiPost, readErrors } from "../lib/api.js";
import { slideUp, staggerList } from "../lib/motion.js";
import { ROLES } from "../lib/roles.js";

export default function Members() {
  const { user } = useAuth();
  const [members, setMembers] = useState(null); // null = cargando
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null); // miembro con un cambio en curso
  // Qué ventana está abierta:
  //   null | { type: "add" } | { type: "reset", member } | { type: "password", member, password }
  const [modal, setModal] = useState(null);

  useEffect(() => {
    apiGet("/members/")
      .then(({ ok, data }) => {
        if (ok) {
          setMembers(data);
        } else {
          setError(readErrors(data).general || "No se pudo cargar la lista.");
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  function replaceMember(updated) {
    setMembers(members.map((member) => (member.id === updated.id ? updated : member)));
  }

  // Cambia el rol o el estado de un miembro.
  async function updateMember(member, changes) {
    setBusyId(member.id);
    setError("");
    try {
      const { ok, data } = await apiPatch(`/members/${member.id}/`, changes);
      if (ok) {
        replaceMember(data);
      } else {
        setError(readErrors(data).general || "No se pudo guardar el cambio.");
      }
    } catch (err) {
      setError(err.message);
    }
    setBusyId(null);
  }

  async function resetPassword(member) {
    setBusyId(member.id);
    setError("");
    try {
      const { ok, data } = await apiPost(`/members/${member.id}/reset-password/`);
      if (ok) {
        replaceMember(data);
        setModal({ type: "password", member, password: data.temporary_password });
      } else {
        setModal(null);
        setError(readErrors(data).general || "No se pudo generar la contraseña.");
      }
    } catch (err) {
      setModal(null);
      setError(err.message);
    }
    setBusyId(null);
  }

  function handleCreated(member) {
    setError("");
    setMembers([...members, member]);
    setModal({ type: "password", member, password: member.temporary_password });
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Miembros</h1>
          <p className="mt-1 text-muted-foreground">
            Decide quién puede registrar movimientos y quién solo ver.
          </p>
        </div>
        <Button icon={UserPlus} onClick={() => setModal({ type: "add" })}>
          Agregar miembro
        </Button>
      </div>

      {error && <Alert className="mt-4">{error}</Alert>}

      {!members && !error && (
        <div className="mt-6 space-y-3" aria-label="Cargando miembros">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {members && (
        <motion.ul
          variants={staggerList}
          initial="hidden"
          animate="visible"
          className="mt-6 space-y-3"
        >
          {members.map((member) => (
            <motion.li key={member.id} variants={slideUp}>
              <MemberRow
                member={member}
                isSelf={member.id === user.id}
                busy={busyId === member.id}
                onChangeRole={(role) => updateMember(member, { role })}
                onToggleActive={() => updateMember(member, { is_active: !member.is_active })}
                onResetPassword={() => setModal({ type: "reset", member })}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}

      <AnimatePresence>
        {modal?.type === "add" && (
          <Modal key="add" title="Agregar miembro" onClose={() => setModal(null)}>
            <AddMemberForm onCreated={handleCreated} />
          </Modal>
        )}

        {modal?.type === "reset" && (
          <Modal key="reset" title="Nueva contraseña temporal" onClose={() => setModal(null)}>
            <p className="text-sm text-muted-foreground">
              La contraseña actual de <strong>{modal.member.full_name}</strong> dejará
              de funcionar y tendrá que elegir una nueva al entrar.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                loading={busyId === modal.member.id}
                onClick={() => resetPassword(modal.member)}
              >
                Generar contraseña
              </Button>
            </div>
          </Modal>
        )}

        {modal?.type === "password" && (
          <Modal key="password" title="Contraseña temporal" onClose={() => setModal(null)}>
            <TemporaryPassword
              member={modal.member}
              password={modal.password}
              onClose={() => setModal(null)}
            />
          </Modal>
        )}
      </AnimatePresence>
    </section>
  );
}

function MemberRow({ member, isSelf, busy, onChangeRole, onToggleActive, onResetPassword }) {
  return (
    <Card className={member.is_active ? "" : "bg-background"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="truncate">{member.full_name}</span>
            {isSelf && <Badge className="bg-primary-soft text-primary">Tú</Badge>}
            {!member.is_active && (
              <Badge className="bg-muted text-muted-foreground">Desactivado</Badge>
            )}
            {member.must_change_password && member.is_active && (
              <Badge className="bg-accent-soft text-emerald-900">Contraseña temporal</Badge>
            )}
          </p>
          <p className="truncate text-sm text-muted-foreground">{member.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Rol de ${member.full_name}`}
            value={member.role}
            disabled={busy}
            onChange={(event) => onChangeRole(event.target.value)}
            className="min-h-11 cursor-pointer rounded-lg border border-border bg-card px-3 text-sm font-medium disabled:opacity-60"
          >
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>

          {!isSelf && (
            <Button
              variant="secondary"
              icon={RotateCcwKey}
              disabled={busy}
              onClick={onResetPassword}
              aria-label={`Nueva contraseña temporal para ${member.full_name}`}
            >
              Contraseña
            </Button>
          )}

          <Button
            variant={member.is_active ? "danger" : "secondary"}
            disabled={busy}
            onClick={onToggleActive}
          >
            {member.is_active ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Badge({ className, children }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
