// "Demo": marks records made by `npm run demo:seed`, so nobody mistakes them for
// real reports.
export default function DemoTag({ className = "" }) {
  return (
    <span className={`rounded-full border border-line-strong px-2.5 py-0.5 text-xs font-semibold text-ink-muted ${className}`}>Demo</span>
  );
}
