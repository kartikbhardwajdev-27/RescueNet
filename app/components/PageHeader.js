export default function PageHeader({ title, description }) {
  return (
    <header className="mb-8">
      <span aria-hidden="true" className="mb-4 block h-1.5 w-12 rounded-full bg-brand-gradient" />
      <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">{description}</p>
    </header>
  );
}
