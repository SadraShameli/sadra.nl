import { sql } from 'drizzle-orm';
import {
    index,
    integer,
    pgTableCreator,
    primaryKey,
    real,
    serial,
    timestamp,
    varchar,
} from 'drizzle-orm/pg-core';

import { bytea } from './types';

export const createTable = pgTableCreator((name) => `sadra.nl_${name}`);

export const location = createTable(
    'location',
    {
        id: serial('id').primaryKey(),
        created_at: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        name: varchar('name', { length: 256 }).notNull(),
        location_name: varchar('location_name', { length: 256 }).notNull(),
        location_id: integer('location_id').notNull().unique(),
    },
    (table) => ({
        nameIndex: index('location_name_idx').on(table.name),
        locationIdIndex: index('location_id_idx').on(table.location_id),
    }),
);

export const sensor = createTable(
    'sensor',
    {
        id: serial('id').primaryKey(),
        created_at: timestamp('created_at', { withTimezone: true })
            .default(sql`CURRENT_TIMESTAMP`)
            .notNull(),
        name: varchar('name', { length: 256 }).notNull(),
        unit: varchar('unit', { length: 256 }).notNull(),
    },
    (table) => ({
        nameIndex: index('sensor_name_idx').on(table.name),
    }),
);

export const device = createTable(
    'device',
    {
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
    },
    (table) => ({
        deviceIdIndex: index('device_device_id_idx').on(table.device_id),
        locationIdIndex: index('device_location_id_idx').on(table.location_id),
    }),
);

export const reading = createTable(
    'reading',
    {
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
    },
    (table) => ({
        sensorIdIndex: index('reading_sensor_id_idx').on(table.sensor_id),
        locationIdIndex: index('reading_location_id_idx').on(table.location_id),
        deviceIdIndex: index('reading_device_id_idx').on(table.device_id),
    }),
);

export const recording = createTable(
    'recording',
    {
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
    },
    (table) => ({
        locationIdIndex: index('recording_location_id_idx').on(
            table.location_id,
        ),
        deviceIdIndex: index('recording_device_id_idx').on(table.device_id),
    }),
);

export const sensorsToDevices = createTable(
    'sensors_to_devices',
    {
        sensor_id: integer('sensor_id')
            .notNull()
            .references(() => sensor.id),
        device_id: integer('device_id')
            .notNull()
            .references(() => device.id),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.sensor_id, table.device_id] }),
        sensorIdIndex: index('sensors_to_devices_sensor_id_idx').on(
            table.sensor_id,
        ),
        deviceIdIndex: index('sensors_to_devices_device_id_idx').on(
            table.device_id,
        ),
    }),
);
