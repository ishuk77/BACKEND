-- Integer minor-unit mirrors are authoritative for new wallet mutations.
-- The decimal columns remain temporarily for legacy dashboard compatibility.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS wallet_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE platform_accounts ADD COLUMN IF NOT EXISTS internal_wallet_minor BIGINT NOT NULL DEFAULT 0;

UPDATE groups SET wallet_minor = ROUND(COALESCE(wallet, 0) * 100)::BIGINT
WHERE wallet_minor = 0 AND COALESCE(wallet, 0) <> 0;
UPDATE platform_accounts SET internal_wallet_minor = ROUND(COALESCE(internal_wallet, 0) * 100)::BIGINT
WHERE internal_wallet_minor = 0 AND COALESCE(internal_wallet, 0) <> 0;

ALTER TABLE public_comment_receipts
    DROP CONSTRAINT IF EXISTS public_comment_receipts_platform_amount_minor_check;
ALTER TABLE public_comment_receipts
    DROP CONSTRAINT IF EXISTS public_comment_receipts_author_amount_minor_check;
ALTER TABLE public_comment_receipts
    ALTER COLUMN platform_amount_minor TYPE INTEGER USING ROUND(platform_amount_minor)::INTEGER;
ALTER TABLE public_comment_receipts
    ALTER COLUMN author_amount_minor TYPE INTEGER USING ROUND(author_amount_minor)::INTEGER;
ALTER TABLE public_comment_receipts
    ADD CONSTRAINT public_comment_receipts_platform_amount_minor_check CHECK (platform_amount_minor = 13);
ALTER TABLE public_comment_receipts
    ADD CONSTRAINT public_comment_receipts_author_amount_minor_check CHECK (author_amount_minor = 12);
