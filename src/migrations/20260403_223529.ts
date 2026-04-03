import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
    await db.execute(sql`
   CREATE TABLE "resume_projects_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "resume_projects_skills" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "resume_projects" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"role" varchar,
  	"date" varchar NOT NULL,
  	"url" varchar,
  	"location_title" varchar,
  	"location_url" varchar,
  	"summary" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "resume_experience_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "resume_experience_skills" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "resume_experience" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"role" varchar,
  	"date" varchar NOT NULL,
  	"url" varchar,
  	"location_title" varchar,
  	"location_url" varchar,
  	"summary" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "resume_education_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "resume_education_skills" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "resume_education" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"role" varchar,
  	"date" varchar NOT NULL,
  	"url" varchar,
  	"location_title" varchar,
  	"location_url" varchar,
  	"summary" varchar,
  	"image_id" integer
  );
  
  CREATE TABLE "resume" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meta_title" varchar NOT NULL,
  	"meta_description" varchar NOT NULL,
  	"projects_section_title" varchar NOT NULL,
  	"experience_section_title" varchar NOT NULL,
  	"education_section_title" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "resume_projects_highlights" ADD CONSTRAINT "resume_projects_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume_projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_projects_skills" ADD CONSTRAINT "resume_projects_skills_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume_projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_projects" ADD CONSTRAINT "resume_projects_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "resume_projects" ADD CONSTRAINT "resume_projects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_experience_highlights" ADD CONSTRAINT "resume_experience_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume_experience"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_experience_skills" ADD CONSTRAINT "resume_experience_skills_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume_experience"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_experience" ADD CONSTRAINT "resume_experience_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "resume_experience" ADD CONSTRAINT "resume_experience_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_education_highlights" ADD CONSTRAINT "resume_education_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume_education"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_education_skills" ADD CONSTRAINT "resume_education_skills_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume_education"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resume_education" ADD CONSTRAINT "resume_education_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "resume_education" ADD CONSTRAINT "resume_education_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."resume"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "resume_projects_highlights_order_idx" ON "resume_projects_highlights" USING btree ("_order");
  CREATE INDEX "resume_projects_highlights_parent_id_idx" ON "resume_projects_highlights" USING btree ("_parent_id");
  CREATE INDEX "resume_projects_skills_order_idx" ON "resume_projects_skills" USING btree ("_order");
  CREATE INDEX "resume_projects_skills_parent_id_idx" ON "resume_projects_skills" USING btree ("_parent_id");
  CREATE INDEX "resume_projects_order_idx" ON "resume_projects" USING btree ("_order");
  CREATE INDEX "resume_projects_parent_id_idx" ON "resume_projects" USING btree ("_parent_id");
  CREATE INDEX "resume_projects_image_idx" ON "resume_projects" USING btree ("image_id");
  CREATE INDEX "resume_experience_highlights_order_idx" ON "resume_experience_highlights" USING btree ("_order");
  CREATE INDEX "resume_experience_highlights_parent_id_idx" ON "resume_experience_highlights" USING btree ("_parent_id");
  CREATE INDEX "resume_experience_skills_order_idx" ON "resume_experience_skills" USING btree ("_order");
  CREATE INDEX "resume_experience_skills_parent_id_idx" ON "resume_experience_skills" USING btree ("_parent_id");
  CREATE INDEX "resume_experience_order_idx" ON "resume_experience" USING btree ("_order");
  CREATE INDEX "resume_experience_parent_id_idx" ON "resume_experience" USING btree ("_parent_id");
  CREATE INDEX "resume_experience_image_idx" ON "resume_experience" USING btree ("image_id");
  CREATE INDEX "resume_education_highlights_order_idx" ON "resume_education_highlights" USING btree ("_order");
  CREATE INDEX "resume_education_highlights_parent_id_idx" ON "resume_education_highlights" USING btree ("_parent_id");
  CREATE INDEX "resume_education_skills_order_idx" ON "resume_education_skills" USING btree ("_order");
  CREATE INDEX "resume_education_skills_parent_id_idx" ON "resume_education_skills" USING btree ("_parent_id");
  CREATE INDEX "resume_education_order_idx" ON "resume_education" USING btree ("_order");
  CREATE INDEX "resume_education_parent_id_idx" ON "resume_education" USING btree ("_parent_id");
  CREATE INDEX "resume_education_image_idx" ON "resume_education" USING btree ("image_id");
  ALTER TABLE "homepage" DROP COLUMN "cta_href";`);
}

export async function down({
    db,
    payload,
    req,
}: MigrateDownArgs): Promise<void> {
    await db.execute(sql`
   DROP TABLE "resume_projects_highlights" CASCADE;
  DROP TABLE "resume_projects_skills" CASCADE;
  DROP TABLE "resume_projects" CASCADE;
  DROP TABLE "resume_experience_highlights" CASCADE;
  DROP TABLE "resume_experience_skills" CASCADE;
  DROP TABLE "resume_experience" CASCADE;
  DROP TABLE "resume_education_highlights" CASCADE;
  DROP TABLE "resume_education_skills" CASCADE;
  DROP TABLE "resume_education" CASCADE;
  DROP TABLE "resume" CASCADE;
  ALTER TABLE "homepage" ADD COLUMN "cta_href" varchar DEFAULT '/resume' NOT NULL;`);
}
