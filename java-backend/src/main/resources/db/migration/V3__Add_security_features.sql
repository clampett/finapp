-- =========================================================
-- V3__Add_security_features.sql
-- =========================================================

-- Add 2FA and Email Verification states to existing users
ALTER TABLE users ADD COLUMN is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(100);
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Secure table for temporary 6-digit codes and password reset links
CREATE TABLE auth_tokens (
                             id         BIGSERIAL PRIMARY KEY,
                             user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                             token      VARCHAR(255) NOT NULL,
                             token_type VARCHAR(50) NOT NULL, -- e.g., 'EMAIL_VERIFICATION' or 'PASSWORD_RESET'
                             created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                             expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_auth_tokens_token ON auth_tokens(token);