-- Migration: add row_version optimistic-lock column to critical tables
-- This migration is idempotent when run on MySQL 8+ which supports
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS row_version INT NOT NULL DEFAULT 1;

ALTER TABLE etapes_programme
  ADD COLUMN IF NOT EXISTS row_version INT NOT NULL DEFAULT 1;

ALTER TABLE inscriptions
  ADD COLUMN IF NOT EXISTS row_version INT NOT NULL DEFAULT 1;

ALTER TABLE progression_etudiants
  ADD COLUMN IF NOT EXISTS row_version INT NOT NULL DEFAULT 1;

-- Optional: parametres_systeme can also have row_version if desired
ALTER TABLE parametres_systeme
  ADD COLUMN IF NOT EXISTS row_version INT NOT NULL DEFAULT 1;
