CREATE TABLE `patient_files` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`category` text DEFAULT 'outros' NOT NULL,
	`file_name` text NOT NULL,
	`mime` text,
	`size` integer,
	`r2_key` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer NOT NULL
);
CREATE INDEX `patient_files_patient_idx` ON `patient_files` (`patient_id`);
