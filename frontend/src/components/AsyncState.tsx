export function LoadingState({
  label = "Loading the module",
}: {
  label?: string;
}) {
  return (
    <div className="state-card" role="status">
      <span className="spinner" />
      {label}…
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="state-card error-state" role="alert">
      <div>
        <strong>We could not load this experience.</strong>
        <p>{message}</p>
      </div>
      <button className="button secondary" type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
