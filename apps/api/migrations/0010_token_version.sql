-- Migration: add token_version column to users for JWT revocation support
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
