export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-line" />
      <div className="h-32 animate-pulse rounded-2xl bg-line" />
      <div className="h-32 animate-pulse rounded-2xl bg-line" />
    </div>
  );
}
