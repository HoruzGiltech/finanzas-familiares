import { canUse } from "../lib/rates.js";
import SegmentedControl from "./SegmentedControl.jsx";

// "Ver montos en $ · € · Bs.". Sin tasa del BCV solo se pueden elegir dólares;
// mientras la tasa no ha llegado (rate vacío) no se desactiva nada.
export default function CurrencyPicker({ currencies, rate, value, onChange, className = "" }) {
  const options = currencies.map((item) => ({
    value: item.code,
    label: item.symbol,
    ariaLabel: item.name,
    disabled: Boolean(rate) && !canUse(item.code, rate),
  }));
  return (
    <SegmentedControl
      label="Ver montos en"
      options={options}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}
