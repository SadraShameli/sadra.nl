CREATE TABLE "sadranl_auth_rate_limit" (
	"count" integer NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "sadranl_auth_rate_limit_key_unique" UNIQUE("key")
);
