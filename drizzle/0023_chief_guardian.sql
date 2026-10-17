CREATE TABLE "sadranl_site_showcase" (
	"average_r_hundredths" integer NOT NULL,
	"profit_and_loss_cents" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	"win_rate_percent" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sadranl_site_showcase" ADD CONSTRAINT "sadranl_site_showcase_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;