export default function Card({ className = "", children }) {
  return (
    <div
      className={`rounded-card border border-line bg-surface p-6 shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-card-hover motion-safe:hover:-translate-y-0.5 ${className}`}
    >
      {children}
    </div>
  );
}
