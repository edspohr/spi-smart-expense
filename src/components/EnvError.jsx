export default function EnvError({ missing }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-soft max-w-lg w-full border-l-4 border-amber-500">
        <h1 className="text-xl font-bold text-zinc-800 mb-2">Configuración incompleta</h1>
        <p className="text-sm text-zinc-600 mb-4">
          La aplicación no puede iniciar porque faltan variables de entorno. Revisa el archivo
          <code className="mx-1 px-1 rounded bg-zinc-100 text-zinc-800">.env</code>
          (o la configuración del hosting) y vuelve a compilar.
        </p>
        <ul className="font-mono text-sm text-red-600 bg-red-50 rounded-lg p-3 space-y-1">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
