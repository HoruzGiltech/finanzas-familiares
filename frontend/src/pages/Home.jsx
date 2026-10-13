import { ArrowRight, ShieldCheck, Users, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext.jsx";
import Card from "../components/Card.jsx";
import { getRole } from "../lib/roles.js";
import { slideUp, staggerList } from "../lib/motion.js";

function InfoCard({ icon: Icon, label, value, detail }) {
  return (
    <motion.div variants={slideUp}>
      <Card className="h-full">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
          {label}
        </div>
        <p className="mt-2 text-lg font-semibold">{value}</p>
        {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      </Card>
    </motion.div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const role = getRole(user.role);
  const firstName = user.full_name.split(" ")[0];

  return (
    <section>
      <h1 className="text-2xl font-bold">Hola, {firstName}</h1>
      <p className="mt-1 text-muted-foreground">
        Este es el espacio de tu familia.
      </p>

      <motion.div
        variants={staggerList}
        initial="hidden"
        animate="visible"
        className="mt-6 grid gap-4 sm:grid-cols-2"
      >
        <InfoCard icon={Users} label="Familia" value={user.family.name} />
        <InfoCard
          icon={ShieldCheck}
          label="Tu rol"
          value={role.label}
          detail={role.description}
        />
        <motion.div variants={slideUp} className="sm:col-span-2">
          <Card className="text-center">
            <Wallet aria-hidden="true" className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 font-semibold">Ingresos y gastos del mes</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {user.role === "viewer"
                ? "Consulta lo que ha entrado y salido este mes."
                : "Anota un movimiento o revisa lo que ha entrado y salido este mes."}
            </p>
            <Link
              to="/movimientos"
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover"
            >
              Ir a Movimientos
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Card>
        </motion.div>
      </motion.div>
    </section>
  );
}
