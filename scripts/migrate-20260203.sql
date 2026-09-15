-- Migration 2026-02-03: add notes columns for companies and contacts

ALTER TABLE companies ADD COLUMN notes TEXT;
ALTER TABLE contacts ADD COLUMN notes TEXT;
