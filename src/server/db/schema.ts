import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTableCreator,
  real,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { bytea } from './types';

export const createTable = pgTableCreator((name) => `sadra.nl_${name}`);

export const location = createTable('location', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  location_name: varchar('location_name', { length: 256 }).notNull().unique(),
  location_id: integer('location_id').notNull().unique(),
});

export const sensor = createTable('sensor', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  name: varchar('name', { length: 256 }).notNull().unique(),
  unit: varchar('unit', { length: 256 }).notNull(),
  enabled: boolean('enabled').notNull(),
});

export const device = createTable('device', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  device_id: integer('device_id').notNull().unique(),
  location_id: integer('location_id')
    .notNull()
    .references(() => location.id),
  register_interval: integer('register_interval').notNull(),
  loudness_threshold: integer('loudness_threshold').notNull(),
});

export const reading = createTable('reading', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  value: real('value').notNull(),
  sensor_id: integer('sensor_id')
    .notNull()
    .references(() => sensor.id),
  location_id: integer('location_id')
    .notNull()
    .references(() => location.id),
  device_id: integer('device_id')
    .notNull()
    .references(() => device.id),
});

export const recording = createTable('recording', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  location_id: integer('location_id')
    .notNull()
    .references(() => location.id),
  device_id: integer('device_id')
    .notNull()
    .references(() => device.id),
  file_name: varchar('file_name', { length: 256 }).notNull(),
  file: bytea('file').notNull(),
});

export const sensorsToDevices = createTable('sensors_to_devices', {
  sensor_id: integer('sensor_id')
    .notNull()
    .references(() => sensor.id),
  device_id: integer('device_id')
    .notNull()
    .references(() => device.id),
});
