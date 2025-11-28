/**
 * Layout minimal pour une application backend pure
 * Next.js est utilisé uniquement pour les routes API
 */

import type { Metadata } from 'next'
// Note: L'initialisation se fait via instrumentation.ts au démarrage du serveur

export const metadata: Metadata = {
  title: 'Vinted Alerts API',
  description: 'Backend API pour les alertes Vinted basées sur les favoris',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
