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
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  locationName: varchar('location_name', { length: 256 }).notNull().unique(),
  locationId: integer('location_id').notNull().unique(),
});

export const sensor = createTable('sensor', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  name: varchar('name', { length: 256 }).notNull().unique(),
  unit: varchar('unit', { length: 256 }).notNull(),
  enabled: boolean('enabled').notNull(),
});

export const device = createTable('device', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  deviceId: integer('device_id').notNull().unique(),
  locationId: integer('location_id')
    .notNull()
    .references(() => location.id),
  registerInterval: integer('register_interval').notNull(),
  loudnessThreshold: integer('loudness_threshold').notNull(),
});

export const reading = createTable('reading', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  value: real('value').notNull(),
  sensorId: integer('sensor_id')
    .notNull()
    .references(() => sensor.id),
  locationId: integer('location_id')
    .notNull()
    .references(() => location.id),
  deviceId: integer('device_id')
    .notNull()
    .references(() => device.id),
});

export const recording = createTable('recording', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  locationId: integer('location_id')
    .notNull()
    .references(() => location.id),
  deviceId: integer('device_id')
    .notNull()
    .references(() => device.id),
  fileName: varchar('file_name', { length: 256 }).notNull(),
  file: bytea('file').notNull(),
});

export const sensorsToDevices = createTable('sensors_to_devices', {
  sensorId: integer('sensor_id')
    .notNull()
    .references(() => sensor.id),
  deviceId: integer('device_id')
    .notNull()
    .references(() => device.id),
});
