CREATE TABLE "sadranl_prop_bankroll_transfer" (
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(32) NOT NULL,
	"note" text,
	"occurred_on" varchar(10) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_bankroll_transfer_amount_positive_ck" CHECK ("sadranl_prop_bankroll_transfer"."amount_cents" > 0),
	CONSTRAINT "prop_bankroll_transfer_occurred_on_ck" CHECK ("sadranl_prop_bankroll_transfer"."occurred_on" IS NULL OR CASE WHEN "sadranl_prop_bankroll_transfer"."occurred_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_bankroll_transfer"."occurred_on", 1, 4)::integer, substr("sadranl_prop_bankroll_transfer"."occurred_on", 6, 2)::integer, 1) + (substr("sadranl_prop_bankroll_transfer"."occurred_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_bankroll_transfer"."occurred_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_external_firm" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_external_firm_id_user_id_uq" UNIQUE("id","user_id"),
	CONSTRAINT "prop_external_firm_name_ck" CHECK (char_length("sadranl_prop_external_firm"."name") > 0)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_firm_engagement" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"external_firm_id" uuid,
	"firm_id" varchar(32),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note" text,
	"reason" varchar(32),
	"sent_live_on" varchar(10),
	"since_on" varchar(10) NOT NULL,
	"status" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_firm_engagement_one_firm_ck" CHECK (("sadranl_prop_firm_engagement"."firm_id" IS NULL) <> ("sadranl_prop_firm_engagement"."external_firm_id" IS NULL)),
	CONSTRAINT "prop_firm_engagement_reason_ck" CHECK (("sadranl_prop_firm_engagement"."status" = 'active') = ("sadranl_prop_firm_engagement"."reason" IS NULL)),
	CONSTRAINT "prop_firm_engagement_sent_live_reason_ck" CHECK (("sadranl_prop_firm_engagement"."reason" IS NOT DISTINCT FROM 'sent-live') = ("sadranl_prop_firm_engagement"."sent_live_on" IS NOT NULL)),
	CONSTRAINT "prop_firm_engagement_sent_live_before_since_ck" CHECK ("sadranl_prop_firm_engagement"."sent_live_on" IS NULL OR "sadranl_prop_firm_engagement"."sent_live_on" <= "sadranl_prop_firm_engagement"."since_on"),
	CONSTRAINT "prop_firm_engagement_since_on_ck" CHECK ("sadranl_prop_firm_engagement"."since_on" IS NULL OR CASE WHEN "sadranl_prop_firm_engagement"."since_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_firm_engagement"."since_on", 1, 4)::integer, substr("sadranl_prop_firm_engagement"."since_on", 6, 2)::integer, 1) + (substr("sadranl_prop_firm_engagement"."since_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_firm_engagement"."since_on" ELSE false END),
	CONSTRAINT "prop_firm_engagement_sent_live_on_ck" CHECK ("sadranl_prop_firm_engagement"."sent_live_on" IS NULL OR CASE WHEN "sadranl_prop_firm_engagement"."sent_live_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_firm_engagement"."sent_live_on", 1, 4)::integer, substr("sadranl_prop_firm_engagement"."sent_live_on", 6, 2)::integer, 1) + (substr("sadranl_prop_firm_engagement"."sent_live_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_firm_engagement"."sent_live_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_firm_statement" (
	"as_of" varchar(10) NOT NULL,
	"basis" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"external_firm_id" uuid,
	"firm_id" varchar(32),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note" text,
	"reported_payout_cents" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_firm_statement_one_firm_ck" CHECK (("sadranl_prop_firm_statement"."firm_id" IS NULL) <> ("sadranl_prop_firm_statement"."external_firm_id" IS NULL)),
	CONSTRAINT "prop_firm_statement_reported_payout_ck" CHECK ("sadranl_prop_firm_statement"."reported_payout_cents" >= 0),
	CONSTRAINT "prop_firm_statement_as_of_ck" CHECK ("sadranl_prop_firm_statement"."as_of" IS NULL OR CASE WHEN "sadranl_prop_firm_statement"."as_of" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_firm_statement"."as_of", 1, 4)::integer, substr("sadranl_prop_firm_statement"."as_of", 6, 2)::integer, 1) + (substr("sadranl_prop_firm_statement"."as_of", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_firm_statement"."as_of" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_round" (
	"budget_cents" integer,
	"closed_on" varchar(10),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"external_firm_id" uuid,
	"firm_id" varchar(32),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(64) NOT NULL,
	"notes" text,
	"opened_on" varchar(10) NOT NULL,
	"status" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_round_id_user_id_uq" UNIQUE("id","user_id"),
	CONSTRAINT "prop_round_one_firm_ck" CHECK ("sadranl_prop_round"."firm_id" IS NULL OR "sadranl_prop_round"."external_firm_id" IS NULL),
	CONSTRAINT "prop_round_budget_positive_ck" CHECK ("sadranl_prop_round"."budget_cents" > 0),
	CONSTRAINT "prop_round_closed_after_open_ck" CHECK ("sadranl_prop_round"."closed_on" IS NULL OR "sadranl_prop_round"."closed_on" >= "sadranl_prop_round"."opened_on"),
	CONSTRAINT "prop_round_closed_on_iff_closed_ck" CHECK (("sadranl_prop_round"."status" = 'closed') = ("sadranl_prop_round"."closed_on" IS NOT NULL)),
	CONSTRAINT "prop_round_opened_on_ck" CHECK ("sadranl_prop_round"."opened_on" IS NULL OR CASE WHEN "sadranl_prop_round"."opened_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_round"."opened_on", 1, 4)::integer, substr("sadranl_prop_round"."opened_on", 6, 2)::integer, 1) + (substr("sadranl_prop_round"."opened_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_round"."opened_on" ELSE false END),
	CONSTRAINT "prop_round_closed_on_ck" CHECK ("sadranl_prop_round"."closed_on" IS NULL OR CASE WHEN "sadranl_prop_round"."closed_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_round"."closed_on", 1, 4)::integer, substr("sadranl_prop_round"."closed_on", 6, 2)::integer, 1) + (substr("sadranl_prop_round"."closed_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_round"."closed_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_rule_violation" (
	"account_id" uuid NOT NULL,
	"cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"decision_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(32) NOT NULL,
	"note" text,
	"occurred_on" varchar(10) NOT NULL,
	"source" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_rule_violation_occurred_on_ck" CHECK ("sadranl_prop_rule_violation"."occurred_on" IS NULL OR CASE WHEN "sadranl_prop_rule_violation"."occurred_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_rule_violation"."occurred_on", 1, 4)::integer, substr("sadranl_prop_rule_violation"."occurred_on", 6, 2)::integer, 1) + (substr("sadranl_prop_rule_violation"."occurred_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_rule_violation"."occurred_on" ELSE false END)
);
--> statement-breakpoint
ALTER TABLE "sadranl_prop_account" ADD COLUMN "round_id" uuid;--> statement-breakpoint
ALTER TABLE "sadranl_prop_payout" ADD COLUMN "approved_on" varchar(10);--> statement-breakpoint
ALTER TABLE "sadranl_prop_bankroll_transfer" ADD CONSTRAINT "sadranl_prop_bankroll_transfer_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_external_firm" ADD CONSTRAINT "sadranl_prop_external_firm_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_firm_engagement" ADD CONSTRAINT "sadranl_prop_firm_engagement_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_firm_engagement" ADD CONSTRAINT "prop_firm_engagement_external_firm_fk" FOREIGN KEY ("external_firm_id","user_id") REFERENCES "public"."sadranl_prop_external_firm"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_firm_statement" ADD CONSTRAINT "sadranl_prop_firm_statement_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_firm_statement" ADD CONSTRAINT "prop_firm_statement_external_firm_fk" FOREIGN KEY ("external_firm_id","user_id") REFERENCES "public"."sadranl_prop_external_firm"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_round" ADD CONSTRAINT "sadranl_prop_round_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_round" ADD CONSTRAINT "prop_round_external_firm_fk" FOREIGN KEY ("external_firm_id","user_id") REFERENCES "public"."sadranl_prop_external_firm"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_rule_violation" ADD CONSTRAINT "sadranl_prop_rule_violation_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_rule_violation" ADD CONSTRAINT "prop_rule_violation_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prop_bankroll_transfer_user_occurred_idx" ON "sadranl_prop_bankroll_transfer" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_external_firm_user_name_idx" ON "sadranl_prop_external_firm" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "prop_firm_engagement_user_since_idx" ON "sadranl_prop_firm_engagement" USING btree ("user_id","since_on");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_firm_engagement_user_firm_idx" ON "sadranl_prop_firm_engagement" USING btree ("user_id","firm_id") WHERE firm_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "prop_firm_engagement_user_external_firm_idx" ON "sadranl_prop_firm_engagement" USING btree ("user_id","external_firm_id") WHERE external_firm_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prop_firm_statement_user_firm_as_of_idx" ON "sadranl_prop_firm_statement" USING btree ("user_id","firm_id","as_of");--> statement-breakpoint
CREATE INDEX "prop_firm_statement_user_external_firm_as_of_idx" ON "sadranl_prop_firm_statement" USING btree ("user_id","external_firm_id","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_round_user_label_idx" ON "sadranl_prop_round" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "prop_round_external_firm_idx" ON "sadranl_prop_round" USING btree ("external_firm_id","user_id") WHERE external_firm_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prop_rule_violation_user_account_occurred_idx" ON "sadranl_prop_rule_violation" USING btree ("user_id","account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "prop_rule_violation_decision_idx" ON "sadranl_prop_rule_violation" USING btree ("decision_id","account_id","user_id") WHERE decision_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account" ADD CONSTRAINT "prop_account_round_fk" FOREIGN KEY ("round_id","user_id") REFERENCES "public"."sadranl_prop_round"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prop_account_round_idx" ON "sadranl_prop_account" USING btree ("round_id","user_id") WHERE round_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "sadranl_prop_sizing_decision" ADD CONSTRAINT "prop_sizing_decision_id_account_user_uq" UNIQUE("id","account_id","user_id");--> statement-breakpoint
ALTER TABLE "sadranl_prop_payout" ADD CONSTRAINT "prop_payout_approved_after_request_ck" CHECK ("sadranl_prop_payout"."approved_on" IS NULL OR "sadranl_prop_payout"."approved_on" >= "sadranl_prop_payout"."requested_on");--> statement-breakpoint
ALTER TABLE "sadranl_prop_payout" ADD CONSTRAINT "prop_payout_paid_after_approval_ck" CHECK ("sadranl_prop_payout"."paid_on" IS NULL OR "sadranl_prop_payout"."approved_on" IS NULL OR "sadranl_prop_payout"."paid_on" >= "sadranl_prop_payout"."approved_on");--> statement-breakpoint
ALTER TABLE "sadranl_prop_payout" ADD CONSTRAINT "prop_payout_approved_on_ck" CHECK ("sadranl_prop_payout"."approved_on" IS NULL OR CASE WHEN "sadranl_prop_payout"."approved_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_payout"."approved_on", 1, 4)::integer, substr("sadranl_prop_payout"."approved_on", 6, 2)::integer, 1) + (substr("sadranl_prop_payout"."approved_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_payout"."approved_on" ELSE false END);