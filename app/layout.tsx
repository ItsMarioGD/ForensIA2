import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForensIA2 · Simulación Forense de Choques",
  description:
    "Reconstrucción 3D de choques con trayectorias en tiempo real, cámaras múltiples y exportación de video.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
