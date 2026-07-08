ALTER TABLE `clinics` ADD `company_code` text;
ALTER TABLE `clinics` ADD `plan` text DEFAULT 'essencial' NOT NULL;
ALTER TABLE `clinics` ADD `tax_id_type` text;
ALTER TABLE `clinics` ADD `tax_id` text;
UPDATE `clinics` SET `company_code` = 'VTX-' || upper(substr(hex(randomblob(6)), 1, 8)) WHERE `company_code` IS NULL;
CREATE UNIQUE INDEX `clinics_company_code_unique` ON `clinics` (`company_code`);
