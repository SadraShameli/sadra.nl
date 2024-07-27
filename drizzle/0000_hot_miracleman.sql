CREATE TABLE IF NOT EXISTS "sadra.nl_device" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar(256) NOT NULL,
	"device_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"register_interval" integer NOT NULL,
	"loudness_threshold" integer NOT NULL,
	CONSTRAINT "sadra.nl_device_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sadra.nl_location" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar(256) NOT NULL,
	"location_name" varchar(256) NOT NULL,
	"location_id" integer NOT NULL,
	CONSTRAINT "sadra.nl_location_location_name_unique" UNIQUE("location_name"),
	CONSTRAINT "sadra.nl_location_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sadra.nl_reading" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"value" real NOT NULL,
	"sensor_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"device_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sadra.nl_recording" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"location_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"file_name" varchar(256) NOT NULL,
	"file" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sadra.nl_sensor" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar(256) NOT NULL,
	"unit" varchar(256) NOT NULL,
	CONSTRAINT "sadra.nl_sensor_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sadra.nl_sensors_to_devices" (
	"sensor_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	CONSTRAINT "sadra.nl_sensors_to_devices_sensor_id_device_id_pk" PRIMARY KEY("sensor_id","device_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_device" ADD CONSTRAINT "sadra.nl_device_location_id_sadra.nl_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sadra.nl_location"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_reading" ADD CONSTRAINT "sadra.nl_reading_sensor_id_sadra.nl_sensor_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sadra.nl_sensor"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_reading" ADD CONSTRAINT "sadra.nl_reading_location_id_sadra.nl_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sadra.nl_location"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_reading" ADD CONSTRAINT "sadra.nl_reading_device_id_sadra.nl_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sadra.nl_device"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_recording" ADD CONSTRAINT "sadra.nl_recording_location_id_sadra.nl_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sadra.nl_location"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_recording" ADD CONSTRAINT "sadra.nl_recording_device_id_sadra.nl_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sadra.nl_device"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_sensors_to_devices" ADD CONSTRAINT "sadra.nl_sensors_to_devices_sensor_id_sadra.nl_sensor_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sadra.nl_sensor"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sadra.nl_sensors_to_devices" ADD CONSTRAINT "sadra.nl_sensors_to_devices_device_id_sadra.nl_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sadra.nl_device"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_device_id_idx" ON "sadra.nl_device" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_location_id_idx" ON "sadra.nl_device" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_name_idx" ON "sadra.nl_location" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_id_idx" ON "sadra.nl_location" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_sensor_id_idx" ON "sadra.nl_reading" USING btree ("sensor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_location_id_idx" ON "sadra.nl_reading" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_device_id_idx" ON "sadra.nl_reading" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_location_id_idx" ON "sadra.nl_recording" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_device_id_idx" ON "sadra.nl_recording" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensor_name_idx" ON "sadra.nl_sensor" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensors_to_devices_sensor_id_idx" ON "sadra.nl_sensors_to_devices" USING btree ("sensor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sensors_to_devices_device_id_idx" ON "sadra.nl_sensors_to_devices" USING btree ("device_id");