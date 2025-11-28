/**
 * Page d'accueil minimale - Backend API
 */

export default function HomePage() {
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '50px auto', 
      padding: '2rem',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        🎮 API Vinted Alerts - Backend
      </h1>
      
      <div style={{ 
        backgroundColor: '#f5f5f5', 
        padding: '1.5rem', 
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>API Endpoints</h2>
        <ul style={{ lineHeight: '1.8' }}>
          <li><code>POST /api/v1/alerts</code> - Créer une alerte</li>
          <li><code>GET /api/v1/alerts</code> - Lister les alertes</li>
          <li><code>GET /api/v1/alerts/matches</code> - Voir les matches</li>
          <li><code>POST /api/v1/alerts/check</code> - Vérifier les alertes</li>
          <li><code>POST /api/v1/telegram/webhook</code> - Webhook Telegram</li>
          <li><code>POST /api/v1/telegram/send-message</code> - Envoyer un message</li>
        </ul>
      </div>

      <div style={{ 
        backgroundColor: '#e3f2fd', 
        padding: '1.5rem', 
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Worker</h2>
        <p style={{ lineHeight: '1.8' }}>
          Le système fonctionne en arrière-plan via le worker :
        </p>
        <pre style={{ 
          backgroundColor: '#2d2d2d', 
          color: '#f8f8f2', 
          padding: '1rem', 
          borderRadius: '4px',
          overflow: 'auto',
          marginTop: '1rem'
        }}>
{`npm run worker:favorites-alerts

# Ou avec npx:
npx tsx scripts/worker-favorites-alerts.ts`}
        </pre>
      </div>

      <div style={{ 
        backgroundColor: '#e8f5e9', 
        padding: '1.5rem', 
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Initialiser les cookies</h2>
        <p style={{ lineHeight: '1.8', marginBottom: '1rem' }}>
          Si l'initialisation automatique ne fonctionne pas au démarrage :
        </p>
        <ul style={{ lineHeight: '1.8', marginBottom: '1rem' }}>
          <li><strong>Via script :</strong> <code>npx tsx scripts/init-cookies.ts</code></li>
          <li><strong>Via API simple :</strong> <code>GET /api/init</code> (sans authentification)</li>
          <li><strong>Via API sécurisée :</strong> <code>POST /api/v1/init/cookies</code> (avec x-api-key)</li>
        </ul>
        <p style={{ lineHeight: '1.8', fontSize: '0.9rem', color: '#666' }}>
          💡 L'initialisation automatique devrait se déclencher au démarrage via <code>instrumentation.ts</code>
        </p>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', borderTop: '1px solid #ddd' }}>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          💡 <strong>Note :</strong> Cette application fonctionne entièrement en backend. 
          Toutes les fonctionnalités sont accessibles via les APIs REST.
        </p>
      </div>
    </div>
  )
}
