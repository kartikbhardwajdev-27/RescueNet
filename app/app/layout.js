import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import SosProvider from "@/components/SosProvider";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: { default: "RescueNet", template: "%s | RescueNet" },
  description: "RescueNet emergency response",
};

export const viewport = {
  themeColor: "#0b0f1a",
  colorScheme: "dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AuthProvider>
          <SosProvider>
            <Sidebar />
            <TopBar />
            <main className="min-h-dvh pt-24 pb-32 md:pt-0 md:pb-0 md:pl-72">
              <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">{children}</div>
            </main>
            <BottomNav />
          </SosProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
