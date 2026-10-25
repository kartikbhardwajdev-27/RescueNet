import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ConnectivityBanner from "@/components/ConnectivityBanner";
import OutboxRunner from "@/components/OutboxRunner";
import PlatformGate from "@/components/PlatformGate";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Sidebar from "@/components/Sidebar";
import SosProvider from "@/components/SosProvider";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: { default: "RescueNet", template: "%s | RescueNet" },
  description: "RescueNet emergency response",
  // The manifest (app/manifest.js) is linked automatically. These are for iOS,
  // which reads its own tags when a page is added to the Home Screen.
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "RescueNet", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#0b0f1a",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <PlatformGate>
          <AuthProvider>
            <SosProvider>
              <OutboxRunner />
              <ServiceWorkerRegister />
              <Sidebar />
              <TopBar />
              <ConnectivityBanner />
              <main className="min-h-dvh pt-24 pb-32 md:pt-0 md:pb-0 md:pl-72">
                <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">{children}</div>
              </main>
              <BottomNav />
            </SosProvider>
          </AuthProvider>
        </PlatformGate>
      </body>
    </html>
  );
}
