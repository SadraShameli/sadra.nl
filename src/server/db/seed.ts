import { endDb } from '.';
import SeedDevice from './seeds/iot/device';
import SeedLocation from './seeds/iot/location';
import SeedReading from './seeds/iot/reading';
import SeedRecording from './seeds/iot/recording';
import SeedSensor from './seeds/iot/sensor';
import SeedSensorsToDevices from './seeds/iot/sensorsToDevices';
import SeedSensorUnit from './seeds/iot/sensorUnit';
import { SeedLiftingExercises } from './seeds/lifting/exercises';
import { SeedLiftingPrograms } from './seeds/lifting/programs';
import { SeederRegistry } from './types';

const registry = new SeederRegistry().registerAll([
    new SeedLocation(),
    new SeedSensorUnit(),
    new SeedSensor(),
    new SeedDevice(),
    new SeedSensorsToDevices(),
    new SeedReading(),
    new SeedRecording(),
    new SeedLiftingExercises(),
    new SeedLiftingPrograms(),
]);

try {
    const report = await registry.runAll();
    const totalSeconds = (report.totalDurationMs / 1000).toFixed(2);
    console.log(
        `\n${report.results.length} seeders completed in ${totalSeconds}s`,
    );
} finally {
    await endDb();
}
