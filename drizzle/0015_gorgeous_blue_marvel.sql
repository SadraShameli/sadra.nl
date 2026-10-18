ALTER TABLE "sadranl_prop_dp_advice" ADD COLUMN "assumed_instrument" varchar(32);--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD COLUMN "assumed_stop_points" double precision;--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD COLUMN "gate_failure" varchar(32);--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD COLUMN "gate_result" varchar(1024);--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "prop_dp_advice_gate_failure_ck" CHECK (NOT "sadranl_prop_dp_advice"."validated" OR "sadranl_prop_dp_advice"."gate_failure" IS NULL);--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "prop_dp_advice_gate_result_ck" CHECK ("sadranl_prop_dp_advice"."gate_result" IS NULL OR "sadranl_prop_dp_advice"."gate_failure" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "prop_dp_advice_assumed_sizing_ck" CHECK (("sadranl_prop_dp_advice"."assumed_instrument" IS NULL) = ("sadranl_prop_dp_advice"."assumed_stop_points" IS NULL));--> statement-breakpoint
ALTER TABLE "sadranl_prop_dp_advice" ADD CONSTRAINT "prop_dp_advice_assumed_stop_points_ck" CHECK ("sadranl_prop_dp_advice"."assumed_stop_points" IS NULL OR "sadranl_prop_dp_advice"."assumed_stop_points" > 0);