import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
    await db.execute(sql`
   CREATE TYPE "public"."enum_site_social_links_platform" AS ENUM('youtube', 'github', 'whatsapp', 'instagram', 'linkedin');
  CREATE TABLE "site_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_site_social_links_platform" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meta_title" varchar DEFAULT 'Sadra' NOT NULL,
  	"meta_description" varchar DEFAULT 'Futures & crypto trader, developer' NOT NULL,
  	"nav_brand" varchar DEFAULT 'sadra' NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "homepage_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"alt" varchar DEFAULT ''
  );
  
  CREATE TABLE "homepage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hero_image_id" integer,
  	"hero_title" varchar DEFAULT 'Sadra Shameli' NOT NULL,
  	"hero_subtitle" varchar DEFAULT 'Futures & crypto trader, developer' NOT NULL,
  	"cta_label" varchar DEFAULT 'More about me' NOT NULL,
  	"cta_href" varchar DEFAULT '/resume' NOT NULL,
  	"sensor_hub_title" varchar DEFAULT 'This is Sensor Hub' NOT NULL,
  	"sensor_hub_description" varchar DEFAULT 'Devices made by me, designed to record and register various climate telemetry and noise pollution data.' NOT NULL,
  	"sensor_hub_video_id" integer,
  	"recordings_title" varchar DEFAULT 'Noise recordings' NOT NULL,
  	"recordings_description" varchar DEFAULT 'Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands.' NOT NULL,
  	"recording_decor_video_id" integer,
  	"readings_title" varchar DEFAULT 'Live readings' NOT NULL,
  	"readings_description" varchar DEFAULT 'Ever been curious about the temperature, humidity and loudness levels at various locations in real time?' NOT NULL,
  	"about_section_title" varchar DEFAULT 'More about me' NOT NULL,
  	"about_spotify_embed_url" varchar DEFAULT 'https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "site_social_links" ADD CONSTRAINT "site_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_gallery" ADD CONSTRAINT "homepage_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_gallery" ADD CONSTRAINT "homepage_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_sensor_hub_video_id_media_id_fk" FOREIGN KEY ("sensor_hub_video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_recording_decor_video_id_media_id_fk" FOREIGN KEY ("recording_decor_video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_social_links_order_idx" ON "site_social_links" USING btree ("_order");
  CREATE INDEX "site_social_links_parent_id_idx" ON "site_social_links" USING btree ("_parent_id");
  CREATE INDEX "homepage_gallery_order_idx" ON "homepage_gallery" USING btree ("_order");
  CREATE INDEX "homepage_gallery_parent_id_idx" ON "homepage_gallery" USING btree ("_parent_id");
  CREATE INDEX "homepage_gallery_image_idx" ON "homepage_gallery" USING btree ("image_id");
  CREATE INDEX "homepage_hero_image_idx" ON "homepage" USING btree ("hero_image_id");
  CREATE INDEX "homepage_sensor_hub_video_idx" ON "homepage" USING btree ("sensor_hub_video_id");
  CREATE INDEX "homepage_recording_decor_video_idx" ON "homepage" USING btree ("recording_decor_video_id");`);
}

export async function down({
    db,
    payload,
    req,
}: MigrateDownArgs): Promise<void> {
    await db.execute(sql`
   DROP TABLE "site_social_links" CASCADE;
  DROP TABLE "site" CASCADE;
  DROP TABLE "homepage_gallery" CASCADE;
  DROP TABLE "homepage" CASCADE;
  DROP TYPE "public"."enum_site_social_links_platform";`);
}
