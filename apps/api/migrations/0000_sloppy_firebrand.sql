CREATE TABLE `ai_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alerts_patient_idx` ON `ai_alerts` (`patient_id`);--> statement-breakpoint
CREATE TABLE `ai_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`appointment_id` text,
	`content` text NOT NULL,
	`suggested_questions` text,
	`model` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`approved_content` text,
	`approved_by` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `summaries_patient_idx` ON `ai_summaries` (`patient_id`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`psychologist_id` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`psychologist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointments_clinic_idx` ON `appointments` (`clinic_id`);--> statement-breakpoint
CREATE INDEX `appointments_starts_idx` ON `appointments` (`starts_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_clinic_idx` ON `audit_log` (`clinic_id`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`granted_at` integer,
	`ip` text,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `consents_patient_idx` ON `consents` (`patient_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`type` text,
	`file_name` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_patient_idx` ON `documents` (`patient_id`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`psychologist_id` text,
	`full_name` text NOT NULL,
	`cpf` text,
	`email` text,
	`phone` text,
	`birth_date` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`psychologist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `patients_clinic_idx` ON `patients` (`clinic_id`);--> statement-breakpoint
CREATE INDEX `patients_psych_idx` ON `patients` (`psychologist_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`psychologist_id` text,
	`occurred_at` integer NOT NULL,
	`mood` text,
	`emotional_scale` integer,
	`topics` text,
	`techniques` text,
	`evolution` text,
	`next_steps` text,
	`free_notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`psychologist_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_patient_idx` ON `sessions` (`patient_id`);--> statement-breakpoint
CREATE TABLE `timeline_events` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`session_id` text,
	`title` text NOT NULL,
	`description` text,
	`event_date` integer,
	`category` text,
	`status` text DEFAULT 'suggested' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `timeline_patient_idx` ON `timeline_events` (`patient_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'psychologist' NOT NULL,
	`patient_id` text,
	`mfa_secret` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_clinic_idx` ON `users` (`clinic_id`);