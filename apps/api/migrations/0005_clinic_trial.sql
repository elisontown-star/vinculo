ALTER TABLE `clinics` ADD `status` text DEFAULT 'trial' NOT NULL;
ALTER TABLE `clinics` ADD `trial_ends_at` integer;
