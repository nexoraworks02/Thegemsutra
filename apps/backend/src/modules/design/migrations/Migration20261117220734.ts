import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117220734 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "design" drop constraint if exists "design_style_code_unique";`);
    this.addSql(`create table if not exists "design" ("id" text not null, "style_code" text not null, "status" text check ("status" in ('draft', 'published')) not null default 'draft', "definition" jsonb not null, "product_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "design_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_design_style_code_unique" ON "design" ("style_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_design_deleted_at" ON "design" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "design" cascade;`);
  }

}
