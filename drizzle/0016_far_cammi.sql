CREATE TABLE "sadranl_user_theme" (
	"name" varchar(80) NOT NULL,
	"source" varchar(16) NOT NULL,
	"styles" jsonb NOT NULL,
	"theme_id" varchar(64) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sadranl_user_theme" ADD CONSTRAINT "sadranl_user_theme_user_id_sadranl_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."sadranl_user"("id") ON DELETE cascade ON UPDATE no action;