// The visible UI is served from /public/index.html (ForensAI original).
// This layout exists only to satisfy Next.js's App Router requirement for
// the /api routes to compile; no HTML tree is rendered from here.
export const metadata = {
  title: "ForensIA",
  description: "Reconstrucción forense con IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
