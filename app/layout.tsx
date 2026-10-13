import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "clipdash",
  description: "Radar de campañas de clipping",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
