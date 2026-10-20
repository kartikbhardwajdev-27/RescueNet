export default function Avatar({ name, className = "size-10 text-base" }) {
  const initial = (name?.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-gradient font-display font-bold text-on-brand ${className}`}
    >
      {initial}
    </span>
  );
}
