// `as` lets a card be a link (`<Card as={Link} href="/map">`); extra props go to it.
// `lift={false}` turns off the hover lift, for cards that aren't clickable (forms).
export default function Card({
  as: Tag = "div",
  padded = true,
  lift = true,
  className = "",
  children,
  ...props
}) {
  const hover = lift
    ? "hover:border-line-strong hover:shadow-card-hover motion-safe:hover:-translate-y-0.5"
    : "";
  return (
    <Tag
      className={`rounded-card border border-line bg-surface shadow-card transition-all duration-200 ${hover} ${padded ? "p-6" : ""} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
