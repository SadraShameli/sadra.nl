CREATE TABLE "sadranl_prop_dp_advice" (
	"account_id" uuid NOT NULL,
	"config_key" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"eligible" boolean NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ineligible_reason" varchar(1024),
	"objective" varchar(32) NOT NULL,
	"plan_rules_fingerprint" varchar(64),
	"plan_serial" varchar(64) NOT NULL,
	"runtime_ms" integer NOT NULL,
	"samples" jsonb NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"solved_at" timestamp with time zone NOT NULL,
	"solver_version" integer NOT NULL,
	"user_id" text NOT NULL,
	"validated" boolean NOT NULL,
	"validation_ref" varchar(256),
	"value_samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "prop_dp_advice_runtime_ms_ck" CHECK ("sadranl_prop_dp_advice"."runtime_ms" >= 0),
	CONSTRAINT "prop_dp_advice_solver_version_ck" CHECK ("sadranl_prop_dp_advice"."solver_version" >= 1),
	CONSTRAINT "prop_dp_advice_config_key_ck" CHECK ("sadranl_prop_dp_advice"."config_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "prop_dp_advice_ineligible_reason_ck" CHECK ("sadranl_prop_dp_advice"."eligible" = ("sadranl_prop_dp_advice"."ineligible_reason" IS NULL)),
	CONSTRAINT "prop_dp_advice_validation_ref_ck" CHECK ("sadranl_prop_dp_advice"."validated" = ("sadranl_prop_dp_advice"."validation_ref" IS NOT NULL)),
	CONSTRAINT "prop_dp_advice_validated_eligible_ck" CHECK ("sadranl_prop_dp_advice"."eligible" OR NOT "sadranl_prop_dp_advice"."validated"),
	CONSTRAINT "prop_dp_advice_gaps_shape_ck" CHECK (CASE WHEN jsonb_typeof("sadranl_prop_dp_advice"."gaps") = 'array' THEN jsonb_array_length("sadranl_prop_dp_advice"."gaps") <= 64 ELSE false END),
	CONSTRAINT "prop_dp_advice_samples_shape_ck" CHECK (jsonb_typeof("sadranl_prop_dp_advice"."samples") = 'object' AND CASE WHEN jsonb_typeof("sadranl_prop_dp_advice"."samples" -> 'samples') = 'array' THEN jsonb_array_length("sadranl_prop_dp_advice"."samples" -> 'samples') <= 512 ELSE ("sadranl_prop_dp_advice"."samples" -> 'samples') IS NULL END),
	CONSTRAINT "prop_dp_advice_value_samples_shape_ck" CHECK (CASE WHEN jsonb_typeof("sadranl_prop_dp_advice"."value_samples") = 'array' THEN jsonb_array_length("sadranl_prop_dp_advice"."value_samples") <= 256 ELSE false END)
);
--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "sadranl_prop_dp_advice_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "prop_dp_advice_account_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."sadranl_prop_account"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "prop_dp_advice_snapshot_fk" FOREIGN KEY ("snapshot_id","account_id","user_id") REFERENCES "public"."sadranl_prop_account_snapshot"("id","account_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prop_dp_advice_user_account_solved_idx" ON "sadranl_prop_dp_advice" USING btree ("user_id","account_id","solved_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "prop_dp_advice_user_account_key_idx" ON "sadranl_prop_dp_advice" USING btree ("user_id","account_id","snapshot_id","config_key","solver_version");