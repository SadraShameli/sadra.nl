DELETE FROM "sadranl_lifting_workout" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_workout"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_personal_record" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_personal_record"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_goal" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_goal"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_measurement" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_measurement"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_routine" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_routine"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_settings" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_settings"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_user_program" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_user_program"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_trade_assessment" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_trade_assessment"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_daily_preparation" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_daily_preparation"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_trading_plan" WHERE "user_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_trading_plan"."user_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_program" WHERE "owner_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_program"."owner_id");
--> statement-breakpoint
DELETE FROM "sadranl_lifting_exercise" WHERE "owner_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "sadranl_user" WHERE "sadranl_user"."id" = "sadranl_lifting_exercise"."owner_id");
