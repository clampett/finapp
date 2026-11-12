-- Added a stable Google subject without guessing links for accounts created before this migration.
ALTER TABLE users ADD COLUMN google_subject VARCHAR(255);

-- Allowed password-only accounts to retain a null subject and prevented duplicate Google identities.
ALTER TABLE users ADD CONSTRAINT uq_users_google_subject UNIQUE (google_subject);
