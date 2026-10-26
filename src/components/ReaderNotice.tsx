import { country } from '../lib/country';

// Notice for the people who submit expenses (Ola 8b, text from
// docs/legal/lector-datos-derivados.md §4): what the reader measures and
// what never leaves the company's environment.

export default function ReaderNotice() {
  return (
    <details className="mt-3 text-xs text-gray-500">
      <summary className="cursor-pointer select-none">
        Para que la lectura sin señal mejore, la app compara lo que leyó el teléfono con lo que tú confirmas. No se guardan fotos extra ni se comparte tu información fuera de tu empresa.{' '}
        <span className="font-medium text-brand-700 underline">Más información</span>
      </summary>
      <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3 text-gray-600">
        <p><strong className="text-gray-800">¿Qué hace la app con mis boletas?</strong> La foto se guarda en el ambiente de tu empresa, como siempre. Además, el teléfono intenta leerla por sí mismo, para que puedas rendir aunque no tengas señal.</p>
        <p><strong className="text-gray-800">¿Qué se mide?</strong> Si el teléfono acertó cada dato (monto, fecha, {country.taxIdLabel}, comercio) comparado con lo que confirmaste. Se guarda solo acertó / no acertó, sin tu nombre.</p>
        <p><strong className="text-gray-800">¿Quién lo ve?</strong> El superadministrador de tu empresa, como porcentajes de acierto.</p>
        <p><strong className="text-gray-800">¿Sale algo de tu empresa?</strong> Solo si tu empresa lo autorizó: datos técnicos sobre el formato de las boletas de empresas (por ejemplo, en qué parte de las boletas de Copec está el total). Nunca tu nombre, tus montos ni tus fotos.</p>
      </div>
    </details>
  );
}
