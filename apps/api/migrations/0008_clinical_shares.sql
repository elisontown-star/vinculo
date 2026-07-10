CREATE TABLE `clinical_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`grantor_id` text NOT NULL,
	`grantee_id` text NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
CREATE INDEX `clinical_shares_grantee_idx` ON `clinical_shares` (`grantee_id`);
CREATE INDEX `clinical_shares_grantor_idx` ON `clinical_shares` (`grantor_id`);
