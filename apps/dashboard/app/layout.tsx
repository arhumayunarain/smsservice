import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMSService Dashboard",
  description: "Self-hosted SMS gateway management dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
