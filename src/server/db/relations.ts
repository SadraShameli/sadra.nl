import { relations } from 'drizzle-orm';
import {
  location,
  sensor,
  device,
  reading,
  recording,
  sensorsToDevices,
} from './schema';

export const locationRelations = relations(location, ({ many }) => ({
  devices: many(device),
  readings: many(reading),
  recordings: many(recording),
}));

export const sensorRelations = relations(sensor, ({ many }) => ({
  sensorsToDevices: many(sensorsToDevices),
  readings: many(reading),
  recordings: many(recording),
}));

export const deviceRelations = relations(device, ({ one, many }) => ({
  location: one(location, {
    fields: [device.locationId],
    references: [location.id],
  }),
  sensorsToDevices: many(sensorsToDevices),
  readings: many(reading),
  recordings: many(recording),
}));

export const readingRelations = relations(reading, ({ one }) => ({
  device: one(device, {
    fields: [reading.deviceId],
    references: [device.id],
  }),
  sensor: one(sensor, {
    fields: [reading.sensorId],
    references: [sensor.id],
  }),
  location: one(location, {
    fields: [reading.locationId],
    references: [location.id],
  }),
}));

export const recordingRelations = relations(recording, ({ one }) => ({
  device: one(device, {
    fields: [recording.deviceId],
    references: [device.id],
  }),
  location: one(location, {
    fields: [recording.locationId],
    references: [location.id],
  }),
}));

export const sensorToDeviceRelations = relations(
  sensorsToDevices,
  ({ one }) => ({
    sensor: one(sensor, {
      fields: [sensorsToDevices.sensorId],
      references: [sensor.id],
    }),
    device: one(device, {
      fields: [sensorsToDevices.deviceId],
      references: [device.id],
    }),
  }),
);
