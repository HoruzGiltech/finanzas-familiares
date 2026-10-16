import { ChevronRight, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import Alert from "../components/Alert.jsx";
import Card from "../components/Card.jsx";
import EditableList from "../components/EditableList.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { apiDelete, apiGet, apiPatch, apiPost, readErrors } from "../lib/api.js";
import { slideUp, staggerList } from "../lib/motion.js";

// Llama a la API y devuelve { data, error }: los datos si salió bien, o el
// mensaje de error en español si no.
async function save(call) {
  try {
    const { ok, data } = await call();
    if (ok) {
      return { data, error: "" };
    }
    const errors = readErrors(data);
    return { data: null, error: errors.fields.name || errors.general || "No se pudo guardar." };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

function withoutId(list, removed) {
  return list.filter((item) => item.id !== removed.id);
}

function replaceById(list, updated) {
  return list.map((item) => (item.id === updated.id ? updated : item));
}

export default function Settings() {
  const [catalogs, setCatalogs] = useState(null); // null = cargando
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    apiGet("/catalogs/?include_inactive=1")
      .then(({ ok, data }) => {
        if (ok) {
          setCatalogs(data);
        } else {
          setLoadError(readErrors(data).general || "No se pudo cargar la configuración.");
        }
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  // --- Categorías ---

  async function addCategory(name, movementType) {
    const { data, error } = await save(() =>
      apiPost("/categories/", { name, movement_type: movementType }),
    );
    if (data) {
      setCatalogs((current) => ({ ...current, categories: [...current.categories, data] }));
    }
    return error;
  }

  async function updateCategory(category, changes) {
    const { data, error } = await save(() => apiPatch(`/categories/${category.id}/`, changes));
    if (data) {
      setCatalogs((current) => ({
        ...current,
        categories: replaceById(current.categories, data),
      }));
    }
    return error;
  }

  async function deleteCategory(category) {
    const { error } = await save(() => apiDelete(`/categories/${category.id}/`));
    if (!error) {
      setCatalogs((current) => ({
        ...current,
        categories: withoutId(current.categories, category),
      }));
    }
    return error;
  }

  // --- Métodos de pago ---

  async function addPaymentMethod(name) {
    const { data, error } = await save(() => apiPost("/payment-methods/", { name }));
    if (data) {
      setCatalogs((current) => ({
        ...current,
        payment_methods: [...current.payment_methods, data],
      }));
    }
    return error;
  }

  async function updatePaymentMethod(method, changes) {
    const { data, error } = await save(() => apiPatch(`/payment-methods/${method.id}/`, changes));
    if (data) {
      setCatalogs((current) => ({
        ...current,
        payment_methods: replaceById(current.payment_methods, data),
      }));
    }
    return error;
  }

  async function deletePaymentMethod(method) {
    const { error } = await save(() => apiDelete(`/payment-methods/${method.id}/`));
    if (!error) {
      setCatalogs((current) => ({
        ...current,
        payment_methods: withoutId(current.payment_methods, method),
      }));
    }
    return error;
  }

  return (
    <section>
      <h1 className="text-2xl font-bold">Configuración</h1>
      <p className="mt-1 text-muted-foreground">
        Prepara las listas que tu familia usará al registrar ingresos y gastos.
      </p>

      {/* En el móvil Miembros no cabe en la barra de abajo (spec 010): se llega desde aquí. */}
      <Link
        to="/miembros"
        className="mt-4 flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 font-medium transition-colors duration-150 hover:bg-muted sm:hidden"
      >
        <Users aria-hidden="true" className="h-5 w-5 text-primary" />
        <span className="flex-1">Miembros de la familia</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </Link>

      {loadError && <Alert className="mt-4">{loadError}</Alert>}

      {!catalogs && !loadError && (
        <div className="mt-6 space-y-4" aria-label="Cargando configuración">
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      )}

      {catalogs && (
        <motion.div
          variants={staggerList}
          initial="hidden"
          animate="visible"
          className="mt-6 space-y-4"
        >
          <motion.div variants={slideUp}>
            <Card>
              <h2 className="text-lg font-semibold">Categorías</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Las desactivadas dejan de ofrecerse. Solo se pueden borrar las que no tienen
                movimientos.
              </p>
              <div className="mt-4 grid gap-8 md:grid-cols-2">
                {/* Una lista por cada tipo de movimiento que haya en la base de datos. */}
                {catalogs.movement_types.map((type) => (
                  <EditableList
                    key={type.code}
                    title={`De ${type.name.toLowerCase()}`}
                    addLabel={`Nueva categoría de ${type.name.toLowerCase()}`}
                    noun="categoría"
                    items={catalogs.categories.filter(
                      (category) => category.movement_type === type.code,
                    )}
                    onAdd={(name) => addCategory(name, type.code)}
                    onRename={(category, name) => updateCategory(category, { name })}
                    onToggle={(category) =>
                      updateCategory(category, { is_active: !category.is_active })
                    }
                    onDelete={deleteCategory}
                  />
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={slideUp}>
            <Card>
              <h2 className="text-lg font-semibold">Métodos de pago</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Igual que las categorías: solo se pueden borrar los que no tienen movimientos.
              </p>
              <div className="mt-4 max-w-xl">
                <EditableList
                  title="Cómo se paga o se cobra"
                  addLabel="Nuevo método de pago"
                  noun="método de pago"
                  items={catalogs.payment_methods}
                  onAdd={addPaymentMethod}
                  onRename={(method, name) => updatePaymentMethod(method, { name })}
                  onToggle={(method) =>
                    updatePaymentMethod(method, { is_active: !method.is_active })
                  }
                  onDelete={deletePaymentMethod}
                />
              </div>
            </Card>
          </motion.div>

          <motion.div variants={slideUp}>
            <Card>
              <h2 className="text-lg font-semibold">Monedas</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Todo se guarda en la moneda base. Los montos en las demás se ven con la tasa oficial
                del BCV de hoy.
              </p>
              <ul className="mt-3 divide-y divide-border">
                {catalogs.currencies.map((currency) => (
                  <li key={currency.code} className="flex items-center gap-3 py-3">
                    <span className="w-12 font-mono font-semibold">{currency.code}</span>
                    <span className="min-w-0 flex-1">
                      {currency.name} ({currency.symbol})
                    </span>
                    {currency.is_base && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary">
                        Moneda base
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
