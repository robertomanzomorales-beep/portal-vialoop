export default function Loading() {
  return (
    <main
      aria-live="polite"
      className="portal-route-loading"
      role="status"
    >
      <div>
        <span aria-hidden="true">Vialoop</span>
        <i aria-hidden="true" />
        <strong>Preparando información</strong>
      </div>
    </main>
  );
}
