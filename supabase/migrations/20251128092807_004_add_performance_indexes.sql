/*
  # Optimisation Database - Indexes de Performance

  1. Indexes Ajoutés
    - `vinted_credentials`: Optimisation des requêtes
    - `search_cache`: Optimisation du cache
    - `vinted_items`: Nouvelle table pour items scrapés
    - `webhook_logs`: Historique des webhooks

  2. Tables Nouvelles
    - `vinted_items`: Stockage des items Vinted
    - `webhook_logs`: Logs des webhooks envoyés

  3. Performance
    - Amélioration des requêtes avec filtres
    - Réduction du temps de réponse
*/

-- Index pour vinted_credentials: recherche récente
CREATE INDEX IF NOT EXISTS idx_vinted_credentials_updated_at
ON vinted_credentials(updated_at DESC);

-- Index pour vinted_credentials: credentials actifs
CREATE INDEX IF NOT EXISTS idx_vinted_credentials_active
ON vinted_credentials(is_active)
WHERE is_active = true;

-- Index pour search_cache: recherche par hash
CREATE INDEX IF NOT EXISTS idx_search_cache_hash
ON search_cache(search_hash);

-- Index pour search_cache: nettoyage des expirations
CREATE INDEX IF NOT EXISTS idx_search_cache_expires_at
ON search_cache(expires_at);

-- Index pour search_cache: tri par popularité
CREATE INDEX IF NOT EXISTS idx_search_cache_hit_count
ON search_cache(hit_count DESC);

-- Créer la table vinted_items
CREATE TABLE IF NOT EXISTS vinted_items (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  price DECIMAL(10, 2),
  brand TEXT,
  size_title TEXT,
  status TEXT,
  url TEXT,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  scraped_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour vinted_items
CREATE INDEX IF NOT EXISTS idx_vinted_items_price ON vinted_items(price) WHERE price IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vinted_items_available ON vinted_items(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_vinted_items_created_at ON vinted_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vinted_items_available_price ON vinted_items(is_available, price) WHERE is_available = true AND price IS NOT NULL;

-- Créer la table webhook_logs
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  response_status INTEGER,
  error_message TEXT,
  attempts INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Index pour webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Enable RLS
ALTER TABLE vinted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policies pour vinted_items
CREATE POLICY "Allow system read access" ON vinted_items FOR SELECT USING (true);
CREATE POLICY "Allow system insert" ON vinted_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow system update" ON vinted_items FOR UPDATE USING (true);

-- Policies pour webhook_logs
CREATE POLICY "Allow system read webhook logs" ON webhook_logs FOR SELECT USING (true);
CREATE POLICY "Allow system insert webhook logs" ON webhook_logs FOR INSERT WITH CHECK (true);

COMMENT ON TABLE vinted_items IS 'Stockage des items Vinted scrapés';
COMMENT ON TABLE webhook_logs IS 'Historique des envois de webhooks';
