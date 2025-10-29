-- Migration: add row_version optimistic-lock column to critical tables
-- This migration is idempotent when run on MySQL 8+ which supports
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- For portability across MySQL/MariaDB versions we avoid vendor-specific
-- `IF NOT EXISTS` in the SQL file. The migration runner will check
-- INFORMATION_SCHEMA and apply each ALTER only when the column is absent.

ALTER TABLE utilisateurs
  ADD COLUMN row_version INT NOT NULL DEFAULT 1;

ALTER TABLE etapes_programme
  ADD COLUMN row_version INT NOT NULL DEFAULT 1;

ALTER TABLE inscriptions
  ADD COLUMN row_version INT NOT NULL DEFAULT 1;

ALTER TABLE progression_etudiants
  ADD COLUMN row_version INT NOT NULL DEFAULT 1;

-- Optional: parametres_systeme can also have row_version if desired
ALTER TABLE parametres_systeme
  ADD COLUMN row_version INT NOT NULL DEFAULT 1;
