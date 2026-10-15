import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { duration, ease } from "../lib/motion.js";

// Cifra que cuenta hasta su valor. `format` la escribe: (n) => "$1.234,50".
// Al cambiar de valor cuenta desde el anterior, no desde cero.
export default function StatNumber({ value, format }) {
  const target = Number(value);
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);
  const last = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(last.current, target, {
      duration: duration.slow,
      ease,
      onUpdate: (latest) => {
        last.current = latest;
        setShown(latest);
      },
    });
    return () => controls.stop();
  }, [target, reduceMotion]);

  return (
    <>
      {/* El lector de pantalla lee solo la cifra final, no la cuenta. */}
      <span aria-hidden="true" className="tabular-nums">
        {format(reduceMotion ? target : shown)}
      </span>
      <span className="sr-only">{format(target)}</span>
    </>
  );
}
