-- Migration: adiciona coluna uploaded_by em patient_files (rastreabilidade de upload)
ALTER TABLE patient_files ADD COLUMN uploaded_by TEXT REFERENCES users(id);
