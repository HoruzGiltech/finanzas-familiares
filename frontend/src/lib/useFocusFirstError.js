import { useEffect } from "react";

// Cuando un formulario recibe errores, lleva el cursor al primer campo con error.
export function useFocusFirstError(fieldErrors) {
  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) {
      document.querySelector('[aria-invalid="true"]')?.focus();
    }
  }, [fieldErrors]);
}
