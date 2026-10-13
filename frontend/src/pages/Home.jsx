import { motion } from "motion/react";
import { useEffect, useState } from "react";

import Skeleton from "../components/Skeleton.jsx";
import StatusCard from "../components/StatusCard.jsx";
import { apiGet } from "../lib/api.js";
import { fadeIn, staggerList } from "../lib/motion.js";

export default function Home() {
  // health: null mientras carga; después, la respuesta de /api/health/.
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet("/health/")
      .then(({ data }) => setHealth(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section>
      <h1 className="text-2xl font-bold">Estado del sistema</h1>
      <p className="mt-1 text-slate-600">
        Comprueba que la aplicación, la API y la base de datos están conectadas.
      </p>

      <div className="mt-6">
        {error && (
          <motion.p
            role="alert"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </motion.p>
        )}

        {!error && !health && (
          <div className="grid gap-4 sm:grid-cols-2" aria-label="Cargando estado">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        )}

        {health && (
          <motion.div
            variants={staggerList}
            initial="hidden"
            animate="visible"
            className="grid gap-4 sm:grid-cols-2"
          >
            <StatusCard title="API" ok={health.status === "ok"} />
            <StatusCard title="Base de datos" ok={health.database === "ok"} />
          </motion.div>
        )}
      </div>
    </section>
  );
}
