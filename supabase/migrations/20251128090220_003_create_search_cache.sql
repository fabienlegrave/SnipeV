/*
  # Create search cache table

  1. New Tables
    - `search_cache`
      - `id` (uuid, primary key)
      - `search_query` (text) - Normalized search query
      - `search_hash` (text, unique) - Hash of query + filters for fast lookup
      - `filters` (jsonb) - Price filters, limits, etc.
      - `results` (jsonb) - Cached search results
      - `item_count` (integer) - Number of items in results
      - `created_at` (timestamptz) - When cache was created
      - `expires_at` (timestamptz) - When cache expires
      - `hit_count` (integer) - Number of times cache was used
      - `last_hit_at` (timestamptz) - Last time cache was accessed
      - `metadata` (jsonb) - Additional metadata (pages searched, etc.)

  2. Indexes
    - Index on search_hash for fast lookups
    - Index on expires_at for cleanup
    - Index on created_at for analytics

  3. Security
    - Enable RLS on `search_cache` table
    - Add policies for authenticated access
*/

CREATE TABLE IF NOT EXISTS search_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query text NOT NULL,
  search_hash text UNIQUE NOT NULL,
  filters jsonb DEFAULT '{}'::jsonb,
  results jsonb NOT NULL,
  item_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer DEFAULT 0,
  last_hit_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_search_cache_hash ON search_cache(search_hash);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_created ON search_cache(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_cache_query ON search_cache(search_query);

ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read search cache"
  ON search_cache FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert to search cache"
  ON search_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update search cache"
  ON search_cache FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete expired cache"
  ON search_cache FOR DELETE
  USING (expires_at < now());

CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM search_cache
  WHERE expires_at < now();
END;
$$;

COMMENT ON TABLE search_cache IS 'Cache des résultats de recherche Vinted pour réduire les appels API';
COMMENT ON COLUMN search_cache.search_hash IS 'Hash MD5 de la requête + filtres pour identification unique';
COMMENT ON COLUMN search_cache.expires_at IS 'Expiration du cache (recommandé: 10-30 minutes)';
COMMENT ON COLUMN search_cache.hit_count IS 'Nombre de fois que ce cache a été utilisé';
