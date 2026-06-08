import type { DatabaseSeeder } from '../types';

import SeedAccountingRules from './accounting/rules';
import SeedDevice from './iot/device';
import SeedLocation from './iot/location';
import SeedReading from './iot/reading';
import SeedRecording from './iot/recording';
import SeedSensor from './iot/sensor';
import SeedSensorsToDevices from './iot/sensorsToDevices';
import SeedSensorUnit from './iot/sensorUnit';
import { SeedLiftingExercises } from './lifting/exercises';
import { SeedLiftingPrograms } from './lifting/programs';

export const seeders: DatabaseSeeder[] = [
    new SeedAccountingRules(),
    new SeedLocation(),
    new SeedSensorUnit(),
    new SeedSensor(),
    new SeedDevice(),
    new SeedSensorsToDevices(),
    new SeedReading(),
    new SeedRecording(),
    new SeedLiftingExercises(),
    new SeedLiftingPrograms(),
];
