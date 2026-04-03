import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
    await db.execute(sql`
   ALTER TABLE "site" ALTER COLUMN "meta_title" DROP DEFAULT;
  ALTER TABLE "site" ALTER COLUMN "meta_description" DROP DEFAULT;
  ALTER TABLE "site" ALTER COLUMN "nav_brand" DROP DEFAULT;
  ALTER TABLE "homepage_gallery" ALTER COLUMN "alt" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "hero_title" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "hero_subtitle" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "cta_label" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "cta_href" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "sensor_hub_title" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "sensor_hub_description" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "recordings_title" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "recordings_description" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "readings_title" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "readings_description" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "about_section_title" DROP DEFAULT;
  ALTER TABLE "homepage" ALTER COLUMN "about_spotify_embed_url" DROP DEFAULT;`);
}

export async function down({
    db,
    payload,
    req,
}: MigrateDownArgs): Promise<void> {
    await db.execute(sql`
   ALTER TABLE "site" ALTER COLUMN "meta_title" SET DEFAULT 'Sadra';
  ALTER TABLE "site" ALTER COLUMN "meta_description" SET DEFAULT 'Futures & crypto trader, developer';
  ALTER TABLE "site" ALTER COLUMN "nav_brand" SET DEFAULT 'sadra';
  ALTER TABLE "homepage_gallery" ALTER COLUMN "alt" SET DEFAULT '';
  ALTER TABLE "homepage" ALTER COLUMN "hero_title" SET DEFAULT 'Sadra Shameli';
  ALTER TABLE "homepage" ALTER COLUMN "hero_subtitle" SET DEFAULT 'Futures & crypto trader, developer';
  ALTER TABLE "homepage" ALTER COLUMN "cta_label" SET DEFAULT 'More about me';
  ALTER TABLE "homepage" ALTER COLUMN "cta_href" SET DEFAULT '/resume';
  ALTER TABLE "homepage" ALTER COLUMN "sensor_hub_title" SET DEFAULT 'This is Sensor Hub';
  ALTER TABLE "homepage" ALTER COLUMN "sensor_hub_description" SET DEFAULT 'Devices made by me, designed to record and register various climate telemetry and noise pollution data.';
  ALTER TABLE "homepage" ALTER COLUMN "recordings_title" SET DEFAULT 'Noise recordings';
  ALTER TABLE "homepage" ALTER COLUMN "recordings_description" SET DEFAULT 'Here you will find a list of noise recordings made by the Sensor Hub devices, which are placed at various locations in the Netherlands.';
  ALTER TABLE "homepage" ALTER COLUMN "readings_title" SET DEFAULT 'Live readings';
  ALTER TABLE "homepage" ALTER COLUMN "readings_description" SET DEFAULT 'Ever been curious about the temperature, humidity and loudness levels at various locations in real time?';
  ALTER TABLE "homepage" ALTER COLUMN "about_section_title" SET DEFAULT 'More about me';
  ALTER TABLE "homepage" ALTER COLUMN "about_spotify_embed_url" SET DEFAULT 'https://open.spotify.com/embed/track/4kjI1gwQZRKNDkw1nI475M?utm_source=generator&theme=0';`);
}
