ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE platform_accounts DROP CONSTRAINT IF EXISTS platform_accounts_status_check;
ALTER TABLE platform_accounts
    ADD CONSTRAINT platform_accounts_status_check
    CHECK (status IN ('active', 'suspended', 'pending_email'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_accounts_identity_number
    ON platform_accounts(identity_number) WHERE identity_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_accounts_email_lower
    ON platform_accounts(LOWER(email)) WHERE email IS NOT NULL;
