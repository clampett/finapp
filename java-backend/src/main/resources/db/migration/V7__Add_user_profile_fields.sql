-- =========================================================
-- V7__Add_user_profile_fields.sql
-- Supports User Stories 18 (Profile Picture) & 20 (Display Name)
-- =========================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;

