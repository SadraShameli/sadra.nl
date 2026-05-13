import { relations } from 'drizzle-orm';

import {
    device,
    location,
    reading,
    recording,
    sensor,
    sensorsToDevices,
} from './schemas/main';

export const databaseRelations = {
    device: relations(device, ({ many, one }) => ({
        location: one(location, {
            fields: [device.location_id],
            references: [location.id],
        }),
        readings: many(reading),
        recordings: many(recording),
        sensorsToDevices: many(sensorsToDevices),
    })),

    location: relations(location, ({ many }) => ({
        devices: many(device),
        readings: many(reading),
        recordings: many(recording),
    })),

    reading: relations(reading, ({ one }) => ({
        device: one(device, {
            fields: [reading.device_id],
            references: [device.id],
        }),
        location: one(location, {
            fields: [reading.location_id],
            references: [location.id],
        }),
        sensor: one(sensor, {
            fields: [reading.sensor_id],
            references: [sensor.id],
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

    sensor: relations(sensor, ({ many }) => ({
        readings: many(reading),
        recordings: many(recording),
        sensorsToDevices: many(sensorsToDevices),
    })),

    sensorsToDevices: relations(sensorsToDevices, ({ one }) => ({
        device: one(device, {
            fields: [sensorsToDevices.device_id],
            references: [device.id],
        }),
        sensor: one(sensor, {
            fields: [sensorsToDevices.sensor_id],
            references: [sensor.id],
        }),
    })),
};
