export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-fade">
      <div className="skeleton mb-3 h-4 w-28" />
      <div className="skeleton mb-8 h-12 w-72 max-w-full" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface p-5">
            <div className="skeleton mb-4 h-3 w-24" />
            <div className="skeleton mb-2 h-6 w-full" />
            <div className="skeleton mb-5 h-6 w-2/3" />
            <div className="skeleton h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
