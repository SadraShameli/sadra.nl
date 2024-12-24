import { relations } from 'drizzle-orm';

import {
    device,
    location,
    reading,
    recording,
    sensor,
    sensorsToDevices,
} from './schema';

export const databaseRelations = {
    location: relations(location, ({ many }) => ({
        devices: many(device),
        readings: many(reading),
        recordings: many(recording),
    })),

    sensor: relations(sensor, ({ many }) => ({
        sensorsToDevices: many(sensorsToDevices),
        readings: many(reading),
        recordings: many(recording),
    })),

    device: relations(device, ({ one, many }) => ({
        location: one(location, {
            fields: [device.location_id],
            references: [location.id],
        }),
        sensorsToDevices: many(sensorsToDevices),
        readings: many(reading),
        recordings: many(recording),
    })),

    reading: relations(reading, ({ one }) => ({
        device: one(device, {
            fields: [reading.device_id],
            references: [device.id],
        }),
        sensor: one(sensor, {
            fields: [reading.sensor_id],
            references: [sensor.id],
        }),
        location: one(location, {
            fields: [reading.location_id],
            references: [location.id],
        }),
    })),

    recording: relations(recording, ({ one }) => ({
        device: one(device, {
            fields: [recording.device_id],
            references: [device.id],
        }),
        location: one(location, {
            fields: [recording.location_id],
            references: [location.id],
        }),
    })),

    sensorsToDevices: relations(sensorsToDevices, ({ one }) => ({
        sensor: one(sensor, {
            fields: [sensorsToDevices.sensor_id],
            references: [sensor.id],
        }),
        device: one(device, {
            fields: [sensorsToDevices.device_id],
            references: [device.id],
        }),
    })),
};
