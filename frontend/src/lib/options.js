// Opciones de una lista desplegable a partir de un catálogo. Si lo que se
// corrige usa un elemento ya desactivado (`current`), se añade para que pueda
// conservarlo.
export function toOptions(items, current, placeholder) {
  const options = items.map((item) => ({ value: item.id, label: item.name }));
  if (current && !items.some((item) => item.id === current.id)) {
    options.push({ value: current.id, label: `${current.name} (desactivada)` });
  }
  return [{ value: "", label: placeholder }, ...options];
}
