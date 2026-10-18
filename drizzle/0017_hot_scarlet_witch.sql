DROP INDEX "reading_location_id_idx";--> statement-breakpoint
CREATE INDEX "accounting_bank_account_credential_id_idx" ON "sadranl_accounting_importer_bank_account" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "accounting_run_accounting_credential_id_idx" ON "sadranl_accounting_importer_run" USING btree ("accounting_credential_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "sadranl_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "sadranl_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "sadranl_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "reading_location_id_created_at_idx" ON "sadranl_reading" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "reading_created_at_idx" ON "sadranl_reading" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lifting_personal_record_exercise_id_idx" ON "sadranl_lifting_personal_record" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "lifting_user_program_program_id_idx" ON "sadranl_lifting_user_program" USING btree ("program_id");