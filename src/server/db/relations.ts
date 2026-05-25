import { relations } from 'drizzle-orm';

import {
    device,
    location,
    reading,
    recording,
    sensor,
    sensorsToDevices,
} from './schemas/iot';
import {
    liftingExercise,
    liftingExerciseAlias,
    liftingPersonalRecord,
    liftingProgram,
    liftingSet,
    liftingUserProgram,
    liftingWorkout,
    liftingWorkoutExercise,
} from './schemas/lifting';

export const deviceRelations = relations(device, ({ many, one }) => ({
    location: one(location, {
        fields: [device.location_id],
        references: [location.id],
    }),
    readings: many(reading),
    recordings: many(recording),
    sensorsToDevices: many(sensorsToDevices),
}));

export const locationRelations = relations(location, ({ many }) => ({
    devices: many(device),
    readings: many(reading),
    recordings: many(recording),
}));

export const readingRelations = relations(reading, ({ one }) => ({
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
}));

export const recordingRelations = relations(recording, ({ one }) => ({
    device: one(device, {
        fields: [recording.device_id],
        references: [device.id],
    }),
    location: one(location, {
        fields: [recording.location_id],
        references: [location.id],
    }),
}));

export const sensorRelations = relations(sensor, ({ many }) => ({
    readings: many(reading),
    recordings: many(recording),
    sensorsToDevices: many(sensorsToDevices),
}));

export const sensorsToDevicesRelations = relations(
    sensorsToDevices,
    ({ one }) => ({
        device: one(device, {
            fields: [sensorsToDevices.device_id],
            references: [device.id],
        }),
        sensor: one(sensor, {
            fields: [sensorsToDevices.sensor_id],
            references: [sensor.id],
        }),
    }),
);

export const liftingExerciseRelations = relations(
    liftingExercise,
    ({ many }) => ({
        aliases: many(liftingExerciseAlias),
        personalRecords: many(liftingPersonalRecord),
        workoutExercises: many(liftingWorkoutExercise),
    }),
);

export const liftingExerciseAliasRelations = relations(
    liftingExerciseAlias,
    ({ one }) => ({
        exercise: one(liftingExercise, {
            fields: [liftingExerciseAlias.exerciseId],
            references: [liftingExercise.id],
        }),
    }),
);

export const liftingPersonalRecordRelations = relations(
    liftingPersonalRecord,
    ({ one }) => ({
        exercise: one(liftingExercise, {
            fields: [liftingPersonalRecord.exerciseId],
            references: [liftingExercise.id],
        }),
    }),
);

export const liftingProgramRelations = relations(
    liftingProgram,
    ({ many }) => ({
        userPrograms: many(liftingUserProgram),
    }),
);

export const liftingSetRelations = relations(liftingSet, ({ one }) => ({
    workoutExercise: one(liftingWorkoutExercise, {
        fields: [liftingSet.workoutExerciseId],
        references: [liftingWorkoutExercise.id],
    }),
}));

export const liftingUserProgramRelations = relations(
    liftingUserProgram,
    ({ one }) => ({
        program: one(liftingProgram, {
            fields: [liftingUserProgram.programId],
            references: [liftingProgram.id],
        }),
    }),
);

export const liftingWorkoutRelations = relations(
    liftingWorkout,
    ({ many }) => ({
        exercises: many(liftingWorkoutExercise),
    }),
);

export const liftingWorkoutExerciseRelations = relations(
    liftingWorkoutExercise,
    ({ many, one }) => ({
        exercise: one(liftingExercise, {
            fields: [liftingWorkoutExercise.exerciseId],
            references: [liftingExercise.id],
        }),
        sets: many(liftingSet),
        workout: one(liftingWorkout, {
            fields: [liftingWorkoutExercise.workoutId],
            references: [liftingWorkout.id],
        }),
    }),
);
