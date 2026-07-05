ALTER TABLE `users` ADD `mfa_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mfa_recovery_codes` text;