CREATE TABLE "sadranl_device" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar(256) NOT NULL,
	"device_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"register_interval" integer NOT NULL,
	"loudness_threshold" integer NOT NULL,
	CONSTRAINT "sadranl_device_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "sadranl_location" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar(256) NOT NULL,
	"location_name" varchar(256) NOT NULL,
	"location_id" integer NOT NULL,
	CONSTRAINT "sadranl_location_location_id_unique" UNIQUE("location_id")
);
--> statement-breakpoint
CREATE TABLE "sadranl_reading" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"value" real NOT NULL,
	"sensor_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"device_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_recording" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"location_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"file_name" varchar(256) NOT NULL,
	"file" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_sensor" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"name" varchar(256) NOT NULL,
	"unit" varchar(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sadranl_sensors_to_devices" (
	"sensor_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	CONSTRAINT "sadranl_sensors_to_devices_sensor_id_device_id_pk" PRIMARY KEY("sensor_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "sadranl_device" ADD CONSTRAINT "sadranl_device_location_id_sadranl_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sadranl_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_reading" ADD CONSTRAINT "sadranl_reading_sensor_id_sadranl_sensor_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sadranl_sensor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_reading" ADD CONSTRAINT "sadranl_reading_location_id_sadranl_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sadranl_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_reading" ADD CONSTRAINT "sadranl_reading_device_id_sadranl_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sadranl_device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_recording" ADD CONSTRAINT "sadranl_recording_location_id_sadranl_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."sadranl_location"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_recording" ADD CONSTRAINT "sadranl_recording_device_id_sadranl_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sadranl_device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_sensors_to_devices" ADD CONSTRAINT "sadranl_sensors_to_devices_sensor_id_sadranl_sensor_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sadranl_sensor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sadranl_sensors_to_devices" ADD CONSTRAINT "sadranl_sensors_to_devices_device_id_sadranl_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."sadranl_device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_device_id_idx" ON "sadranl_device" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_location_id_idx" ON "sadranl_device" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "location_name_idx" ON "sadranl_location" USING btree ("name");--> statement-breakpoint
CREATE INDEX "location_id_idx" ON "sadranl_location" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "reading_sensor_id_idx" ON "sadranl_reading" USING btree ("sensor_id");--> statement-breakpoint
CREATE INDEX "reading_location_id_idx" ON "sadranl_reading" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "reading_device_id_idx" ON "sadranl_reading" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "recording_location_id_idx" ON "sadranl_recording" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "recording_device_id_idx" ON "sadranl_recording" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "sensor_name_idx" ON "sadranl_sensor" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sensors_to_devices_sensor_id_idx" ON "sadranl_sensors_to_devices" USING btree ("sensor_id");--> statement-breakpoint
CREATE INDEX "sensors_to_devices_device_id_idx" ON "sadranl_sensors_to_devices" USING btree ("device_id");