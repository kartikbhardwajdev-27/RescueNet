// `as` lets a card be a link (`<Card as={Link} href="/map">`); extra props go to it.
export default function Card({ as: Tag = "div", padded = true, className = "", children, ...props }) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface shadow-card transition-all duration-200 hover:border-line-strong hover:shadow-card-hover motion-safe:hover:-translate-y-0.5 ${padded ? "p-6" : ""} ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
