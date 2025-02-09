CREATE TABLE "trading_bot_account" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"server" varchar(256) NOT NULL,
	"login" varchar(256) NOT NULL,
	"password" varchar(256) NOT NULL
);
