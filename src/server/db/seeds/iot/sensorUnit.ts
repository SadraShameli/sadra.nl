import { db } from '~/server/db';
import { sensor, sensorUnit } from '~/server/db/schemas/iot';
import { DatabaseSeeder } from '~/server/db/types';

export default class SeedSensorUnit extends DatabaseSeeder {
    readonly name = 'iot:sensor_unit';
    override readonly priority = 105;

    async run(): Promise<void> {
        const [existing, existingFromSensors] = await Promise.all([
            db.select({ value: sensorUnit.value }).from(sensorUnit),
            db.selectDistinct({ unit: sensor.unit }).from(sensor),
        ]);
        const known = new Set(existing.map((r) => r.value));
        const toInsert = existingFromSensors
            .map((r) => r.unit)
            .filter((v) => !known.has(v))
            .map((value) => ({ value }));
        if (toInsert.length > 0) {
            const q = db.insert(sensorUnit).values(toInsert);
            await q;
        }
    }
}
