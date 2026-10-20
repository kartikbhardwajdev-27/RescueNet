// Unlike layout.js, a template remounts on every navigation, so this plays the
// 150ms fade on each page change. Opacity only: no transform, so nothing inside
// gets a new containing block.
export default function Template({ children }) {
  return <div className="animate-page-in">{children}</div>;
}
