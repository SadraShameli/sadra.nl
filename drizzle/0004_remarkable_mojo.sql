CREATE TABLE "sadranl_accounting_importer_run" (
	"accounting_credential_id" uuid,
	"api_credential_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bookings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"error_message" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcomes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" varchar(10) NOT NULL,
	"status" varchar(16) NOT NULL,
	"summary" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_rate_limit_bucket" (
	"bucket" varchar(64) NOT NULL,
	"count" integer NOT NULL,
	"key" varchar(128) NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sadranl_rate_limit_bucket_bucket_key_pk" PRIMARY KEY("bucket","key")
);
--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "currency" varchar(8);--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "date_from" varchar(10);--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "date_to" varchar(10);--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "match_type" varchar(16) DEFAULT 'contains' NOT NULL;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "max_amount" double precision;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "min_amount" double precision;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_rule" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_run" ADD CONSTRAINT "sadranl_accounting_importer_run_accounting_credential_id_sadranl_accounting_importer_credential_id_fk" FOREIGN KEY ("accounting_credential_id") REFERENCES "public"."sadranl_accounting_importer_credential"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_accounting_importer_run" ADD CONSTRAINT "sadranl_accounting_importer_run_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounting_importer_run_user_created_at_idx" ON "sadranl_accounting_importer_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "accounting_importer_rule_sort_order_idx" ON "sadranl_accounting_importer_rule" USING btree ("credential_id","sort_order");