-- Migration: Create vinted_credentials table
-- This table stores Vinted cookies and authentication tokens

CREATE TABLE IF NOT EXISTS vinted_credentials (
  id BIGSERIAL PRIMARY KEY,
  full_cookies TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  user_id TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries on active credentials
CREATE INDEX IF NOT EXISTS idx_vinted_credentials_is_active ON vinted_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_vinted_credentials_updated_at ON vinted_credentials(updated_at DESC);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_vinted_credentials_updated_at ON vinted_credentials;
CREATE TRIGGER update_vinted_credentials_updated_at
  BEFORE UPDATE ON vinted_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment to table
COMMENT ON TABLE vinted_credentials IS 'Stores Vinted authentication cookies and tokens for scraping operations';
COMMENT ON COLUMN vinted_credentials.full_cookies IS 'Full cookie string from Vinted (includes cf_clearance, datadome, access_token_web, etc.)';
COMMENT ON COLUMN vinted_credentials.is_active IS 'Whether this credential set is currently active (only one should be active at a time)';
COMMENT ON COLUMN vinted_credentials.last_used_at IS 'Timestamp of last successful use of these credentials';

