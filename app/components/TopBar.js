import MobileAccount from "./auth/MobileAccount";
import Logo from "./Logo";

// Mobile only. The right side holds the account entry and the "More" menu
// (Resources, About and the account actions); see auth/MobileAccount.js.
export default function TopBar() {
  return (
    <header className="fixed inset-x-3 top-3 z-40 flex h-14 items-center justify-between rounded-3xl border border-line bg-glass pr-1.5 pl-3 shadow-card backdrop-blur-xl md:hidden">
      <Logo />
      <MobileAccount />
    </header>
  );
}
