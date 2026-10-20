import "./globals.css";

export const metadata = {
  title: "RescueNet",
  description: "RescueNet",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
