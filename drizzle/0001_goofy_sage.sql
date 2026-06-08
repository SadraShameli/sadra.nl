CREATE TABLE "sadranl_accounting_importer_bank_account" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"credential_id" uuid NOT NULL,
	"currency" varchar(8) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" integer NOT NULL,
	"ledger_label" varchar(128) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_accounting_importer_rule" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"credential_id" uuid NOT NULL,
	"direction" varchar(3) NOT NULL,
	"display" varchar(128) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" integer NOT NULL,
	"ledger_label" varchar(128) NOT NULL,
	"match" varchar(256) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	"vat_code" varchar(16) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_bank_account" ADD CONSTRAINT "sadranl_accounting_importer_bank_account_credential_id_sadranl_accounting_importer_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."sadranl_accounting_importer_credential"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_bank_account" ADD CONSTRAINT "sadranl_accounting_importer_bank_account_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD CONSTRAINT "sadranl_accounting_importer_rule_credential_id_sadranl_accounting_importer_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."sadranl_accounting_importer_credential"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD CONSTRAINT "sadranl_accounting_importer_rule_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_importer_bank_account_credential_currency_idx" ON "sadranl_accounting_importer_bank_account" USING btree ("credential_id","currency");--> statement-breakpoint
CREATE INDEX "accounting_importer_bank_account_user_idx" ON "sadranl_accounting_importer_bank_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_importer_rule_credential_direction_match_idx" ON "sadranl_accounting_importer_rule" USING btree ("credential_id","direction","match");--> statement-breakpoint
CREATE INDEX "accounting_importer_rule_user_idx" ON "sadranl_accounting_importer_rule" USING btree ("user_id");