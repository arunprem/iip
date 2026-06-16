-- Migration: Add modus_operandi column to intelligence.suspects
ALTER TABLE intelligence.suspects ADD COLUMN IF NOT EXISTS modus_operandi TEXT;
