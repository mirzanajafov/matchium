export function ErrorMessage({
  message,
  id,
  className = "",
}: {
  message?: string | null;
  id?: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={`text-sm text-warn ${className}`.trim()}>
      {message}
    </p>
  );
}
