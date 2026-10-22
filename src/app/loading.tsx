export default function Loading() {
  return (
    <main
      aria-live="polite"
      className="portal-route-loading"
      role="status"
    >
      <div>
        <span aria-hidden="true">V</span>
        <i aria-hidden="true" />
        <strong>Cargando información</strong>
      </div>
    </main>
  );
}
