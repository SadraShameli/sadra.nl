CREATE TABLE "sadranl_prop_account" (
	"account_size" integer NOT NULL,
	"archived_at" timestamp with time zone,
	"copy_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"dashboard_convention" varchar(32) NOT NULL,
	"external_alias" varchar(64),
	"firm_id" varchar(32) NOT NULL,
	"first_funded_trade_on" varchar(10),
	"funded_on" varchar(10),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(64) NOT NULL,
	"live_start_balance_cents" integer,
	"notes" text,
	"opt_ins" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"personal_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan_rules_fingerprint" varchar(64),
	"plan_serial" varchar(64) NOT NULL,
	"purchased_on" varchar(10) NOT NULL,
	"replaces_account_id" uuid,
	"stage" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_account_id_user_id_uq" UNIQUE("id","user_id"),
	CONSTRAINT "prop_account_live_start_balance_ck" CHECK ("sadranl_prop_account"."live_start_balance_cents" >= 0),
	CONSTRAINT "prop_account_not_self_replacing_ck" CHECK ("sadranl_prop_account"."replaces_account_id" <> "sadranl_prop_account"."id"),
	CONSTRAINT "prop_account_purchased_on_ck" CHECK ("sadranl_prop_account"."purchased_on" IS NULL OR CASE WHEN "sadranl_prop_account"."purchased_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account"."purchased_on", 1, 4)::integer, substr("sadranl_prop_account"."purchased_on", 6, 2)::integer, 1) + (substr("sadranl_prop_account"."purchased_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account"."purchased_on" ELSE false END),
	CONSTRAINT "prop_account_funded_on_ck" CHECK ("sadranl_prop_account"."funded_on" IS NULL OR CASE WHEN "sadranl_prop_account"."funded_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account"."funded_on", 1, 4)::integer, substr("sadranl_prop_account"."funded_on", 6, 2)::integer, 1) + (substr("sadranl_prop_account"."funded_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account"."funded_on" ELSE false END),
	CONSTRAINT "prop_account_first_funded_trade_on_ck" CHECK ("sadranl_prop_account"."first_funded_trade_on" IS NULL OR CASE WHEN "sadranl_prop_account"."first_funded_trade_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account"."first_funded_trade_on", 1, 4)::integer, substr("sadranl_prop_account"."first_funded_trade_on", 6, 2)::integer, 1) + (substr("sadranl_prop_account"."first_funded_trade_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account"."first_funded_trade_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_account_event" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(32) NOT NULL,
	"occurred_on" varchar(10) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_account_event_occurred_on_ck" CHECK ("sadranl_prop_account_event"."occurred_on" IS NULL OR CASE WHEN "sadranl_prop_account_event"."occurred_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account_event"."occurred_on", 1, 4)::integer, substr("sadranl_prop_account_event"."occurred_on", 6, 2)::integer, 1) + (substr("sadranl_prop_account_event"."occurred_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account_event"."occurred_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_account_snapshot" (
	"account_id" uuid NOT NULL,
	"as_of" varchar(10) NOT NULL,
	"balance_at_last_payout_cents" integer,
	"balance_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"cumulative_payout_cents" integer,
	"cycle_best_day_profit_cents" integer,
	"dashboard_floor_cents" integer,
	"eval_best_day_profit_cents" integer,
	"floor_at_last_payout_cents" integer,
	"highest_eod_balance_cents" integer,
	"highest_intraday_balance_cents" integer,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_payout_on" varchar(10),
	"last_traded_on" varchar(10),
	"payouts_taken" integer,
	"qualifying_days_since_last_payout" integer,
	"source" varchar(32) NOT NULL,
	"trading_days" integer,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_account_snapshot_id_account_user_uq" UNIQUE("id","account_id","user_id"),
	CONSTRAINT "prop_account_snapshot_cumulative_payout_ck" CHECK ("sadranl_prop_account_snapshot"."cumulative_payout_cents" >= 0),
	CONSTRAINT "prop_account_snapshot_cycle_best_day_ck" CHECK ("sadranl_prop_account_snapshot"."cycle_best_day_profit_cents" >= 0),
	CONSTRAINT "prop_account_snapshot_eval_best_day_ck" CHECK ("sadranl_prop_account_snapshot"."eval_best_day_profit_cents" >= 0),
	CONSTRAINT "prop_account_snapshot_payouts_taken_ck" CHECK ("sadranl_prop_account_snapshot"."payouts_taken" >= 0),
	CONSTRAINT "prop_account_snapshot_trading_days_ck" CHECK ("sadranl_prop_account_snapshot"."trading_days" >= 0),
	CONSTRAINT "prop_account_snapshot_qualifying_days_ck" CHECK ("sadranl_prop_account_snapshot"."qualifying_days_since_last_payout" >= 0),
	CONSTRAINT "prop_account_snapshot_as_of_ck" CHECK ("sadranl_prop_account_snapshot"."as_of" IS NULL OR CASE WHEN "sadranl_prop_account_snapshot"."as_of" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account_snapshot"."as_of", 1, 4)::integer, substr("sadranl_prop_account_snapshot"."as_of", 6, 2)::integer, 1) + (substr("sadranl_prop_account_snapshot"."as_of", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account_snapshot"."as_of" ELSE false END),
	CONSTRAINT "prop_account_snapshot_last_payout_on_ck" CHECK ("sadranl_prop_account_snapshot"."last_payout_on" IS NULL OR CASE WHEN "sadranl_prop_account_snapshot"."last_payout_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account_snapshot"."last_payout_on", 1, 4)::integer, substr("sadranl_prop_account_snapshot"."last_payout_on", 6, 2)::integer, 1) + (substr("sadranl_prop_account_snapshot"."last_payout_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account_snapshot"."last_payout_on" ELSE false END),
	CONSTRAINT "prop_account_snapshot_last_traded_on_ck" CHECK ("sadranl_prop_account_snapshot"."last_traded_on" IS NULL OR CASE WHEN "sadranl_prop_account_snapshot"."last_traded_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_account_snapshot"."last_traded_on", 1, 4)::integer, substr("sadranl_prop_account_snapshot"."last_traded_on", 6, 2)::integer, 1) + (substr("sadranl_prop_account_snapshot"."last_traded_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_account_snapshot"."last_traded_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_copy_group" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_copy_group_id_user_id_uq" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_fee" (
	"account_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(32) NOT NULL,
	"note" text,
	"paid_on" varchar(10) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_fee_amount_non_negative_ck" CHECK ("sadranl_prop_fee"."amount_cents" >= 0),
	CONSTRAINT "prop_fee_paid_on_ck" CHECK ("sadranl_prop_fee"."paid_on" IS NULL OR CASE WHEN "sadranl_prop_fee"."paid_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_fee"."paid_on", 1, 4)::integer, substr("sadranl_prop_fee"."paid_on", 6, 2)::integer, 1) + (substr("sadranl_prop_fee"."paid_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_fee"."paid_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_payout" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"gross_cents" integer NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"net_cents" integer,
	"note" text,
	"paid_on" varchar(10),
	"requested_on" varchar(10) NOT NULL,
	"status" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_payout_gross_positive_ck" CHECK ("sadranl_prop_payout"."gross_cents" > 0),
	CONSTRAINT "prop_payout_net_within_gross_ck" CHECK ("sadranl_prop_payout"."net_cents" IS NULL OR ("sadranl_prop_payout"."net_cents" >= 0 AND "sadranl_prop_payout"."net_cents" <= "sadranl_prop_payout"."gross_cents")),
	CONSTRAINT "prop_payout_paid_on_iff_paid_ck" CHECK (("sadranl_prop_payout"."status" = 'paid') = ("sadranl_prop_payout"."paid_on" IS NOT NULL)),
	CONSTRAINT "prop_payout_paid_after_request_ck" CHECK ("sadranl_prop_payout"."paid_on" IS NULL OR "sadranl_prop_payout"."paid_on" >= "sadranl_prop_payout"."requested_on"),
	CONSTRAINT "prop_payout_requested_on_ck" CHECK ("sadranl_prop_payout"."requested_on" IS NULL OR CASE WHEN "sadranl_prop_payout"."requested_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_payout"."requested_on", 1, 4)::integer, substr("sadranl_prop_payout"."requested_on", 6, 2)::integer, 1) + (substr("sadranl_prop_payout"."requested_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_payout"."requested_on" ELSE false END),
	CONSTRAINT "prop_payout_paid_on_ck" CHECK ("sadranl_prop_payout"."paid_on" IS NULL OR CASE WHEN "sadranl_prop_payout"."paid_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_payout"."paid_on", 1, 4)::integer, substr("sadranl_prop_payout"."paid_on", 6, 2)::integer, 1) + (substr("sadranl_prop_payout"."paid_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_payout"."paid_on" ELSE false END)
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_rulebook" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_saved_scenario" (
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"query" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_prop_sizing_decision" (
	"accepted_risk_cents" integer NOT NULL,
	"accepted_rungs_cents" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"account_id" uuid NOT NULL,
	"actual_risk_cents" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"decided_on" varchar(10) NOT NULL,
	"headline_risk_cents" integer NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note" text,
	"snapshot_id" uuid,
	"source" varchar(32) NOT NULL,
	"stage" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "prop_sizing_decision_accepted_risk_ck" CHECK ("sadranl_prop_sizing_decision"."accepted_risk_cents" >= 0),
	CONSTRAINT "prop_sizing_decision_headline_risk_ck" CHECK ("sadranl_prop_sizing_decision"."headline_risk_cents" >= 0),
	CONSTRAINT "prop_sizing_decision_actual_risk_ck" CHECK ("sadranl_prop_sizing_decision"."actual_risk_cents" >= 0),
	CONSTRAINT "prop_sizing_decision_rungs_positive_ck" CHECK (0 < ALL("sadranl_prop_sizing_decision"."accepted_rungs_cents")),
	CONSTRAINT "prop_sizing_decision_rungs_no_null_ck" CHECK (array_position("sadranl_prop_sizing_decision"."accepted_rungs_cents", NULL) IS NULL),
	CONSTRAINT "prop_sizing_decision_rungs_count_ck" CHECK (cardinality("sadranl_prop_sizing_decision"."accepted_rungs_cents") <= 20),
	CONSTRAINT "prop_sizing_decision_rungs_one_dimension_ck" CHECK (COALESCE(array_ndims("sadranl_prop_sizing_decision"."accepted_rungs_cents"), 1) = 1),
	CONSTRAINT "prop_sizing_decision_decided_on_ck" CHECK ("sadranl_prop_sizing_decision"."decided_on" IS NULL OR CASE WHEN "sadranl_prop_sizing_decision"."decided_on" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN to_char(make_date(substr("sadranl_prop_sizing_decision"."decided_on", 1, 4)::integer, substr("sadranl_prop_sizing_decision"."decided_on", 6, 2)::integer, 1) + (substr("sadranl_prop_sizing_decision"."decided_on", 9, 2)::integer - 1), 'YYYY-MM-DD') = "sadranl_prop_sizing_decision"."decided_on" ELSE false END)
);
--> statement-breakpoint
ALTER TABLE "sadranl_prop_account" ADD CONSTRAINT "sadranl_prop_account_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account" ADD CONSTRAINT "prop_account_copy_group_fk" FOREIGN KEY ("copy_group_id","user_id") REFERENCES "public"."sadranl_prop_copy_group"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account" ADD CONSTRAINT "prop_account_replaces_account_fk" FOREIGN KEY ("replaces_account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account_event" ADD CONSTRAINT "sadranl_prop_account_event_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account_event" ADD CONSTRAINT "prop_account_event_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account_snapshot" ADD CONSTRAINT "sadranl_prop_account_snapshot_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_account_snapshot" ADD CONSTRAINT "prop_account_snapshot_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_copy_group" ADD CONSTRAINT "sadranl_prop_copy_group_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_fee" ADD CONSTRAINT "sadranl_prop_fee_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_fee" ADD CONSTRAINT "prop_fee_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_payout" ADD CONSTRAINT "sadranl_prop_payout_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_payout" ADD CONSTRAINT "prop_payout_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_rulebook" ADD CONSTRAINT "sadranl_prop_rulebook_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_saved_scenario" ADD CONSTRAINT "sadranl_prop_saved_scenario_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_sizing_decision" ADD CONSTRAINT "sadranl_prop_sizing_decision_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_sizing_decision" ADD CONSTRAINT "prop_sizing_decision_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_sizing_decision" ADD CONSTRAINT "prop_sizing_decision_snapshot_fk" FOREIGN KEY ("snapshot_id","account_id","user_id") REFERENCES "public"."sadranl_prop_account_snapshot"("id","account_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prop_account_user_label_active_idx" ON "sadranl_prop_account" USING btree ("user_id","label") WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX "prop_account_user_stage_idx" ON "sadranl_prop_account" USING btree ("user_id","stage");--> statement-breakpoint
CREATE INDEX "prop_account_user_firm_idx" ON "sadranl_prop_account" USING btree ("user_id","firm_id");--> statement-breakpoint
CREATE INDEX "prop_account_copy_group_idx" ON "sadranl_prop_account" USING btree ("copy_group_id","user_id") WHERE copy_group_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prop_account_replaces_account_idx" ON "sadranl_prop_account" USING btree ("replaces_account_id","user_id") WHERE replaces_account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prop_account_event_user_account_occurred_idx" ON "sadranl_prop_account_event" USING btree ("user_id","account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "prop_account_event_user_occurred_idx" ON "sadranl_prop_account_event" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "prop_account_snapshot_user_account_as_of_idx" ON "sadranl_prop_account_snapshot" USING btree ("user_id","account_id","as_of" DESC NULLS FIRST,"created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "prop_copy_group_user_name_idx" ON "sadranl_prop_copy_group" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "prop_fee_user_account_idx" ON "sadranl_prop_fee" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "prop_fee_user_paid_on_idx" ON "sadranl_prop_fee" USING btree ("user_id","paid_on");--> statement-breakpoint
CREATE INDEX "prop_payout_user_account_idx" ON "sadranl_prop_payout" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "prop_payout_user_paid_on_idx" ON "sadranl_prop_payout" USING btree ("user_id","paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "prop_saved_scenario_user_name_idx" ON "sadranl_prop_saved_scenario" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "prop_sizing_decision_snapshot_idx" ON "sadranl_prop_sizing_decision" USING btree ("snapshot_id","account_id","user_id") WHERE snapshot_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prop_sizing_decision_user_account_decided_idx" ON "sadranl_prop_sizing_decision" USING btree ("user_id","account_id","decided_on");