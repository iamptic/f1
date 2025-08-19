-- Safe migration: add city column to merchants if missing
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS city TEXT;
