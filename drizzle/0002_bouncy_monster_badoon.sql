DROP INDEX "accounting_importer_bank_account_credential_currency_idx";--> statement-breakpoint
DROP INDEX "accounting_importer_bank_account_user_idx";--> statement-breakpoint
DROP INDEX "accounting_importer_rule_credential_direction_match_idx";--> statement-breakpoint
DROP INDEX "accounting_importer_rule_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_importer_bank_account_user_credential_currency_idx" ON "sadranl_accounting_importer_bank_account" USING btree ("user_id","credential_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_importer_rule_user_credential_direction_match_idx" ON "sadranl_accounting_importer_rule" USING btree ("user_id","credential_id","direction","match");