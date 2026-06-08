import { db } from '~/server/db';
import { sensor, sensorUnit } from '~/server/db/schemas/iot';
import { DatabaseSeeder } from '~/server/db/types';

const SENSORS: ReadonlyArray<{ name: string; unit: string }> = [
    { name: 'Temperature', unit: '°C' },
    { name: 'Humidity', unit: '%' },
    { name: 'Air Pressure', unit: 'hPa' },
    { name: 'Gas Resistance', unit: 'Ohms' },
    { name: 'Altitude', unit: 'm' },
    { name: 'Loudness', unit: 'dB' },
    { name: 'Recording', unit: 'wav' },
    { name: 'RPM', unit: 'rpm' },
];

export default class SeedSensor extends DatabaseSeeder {
    readonly name = 'iot:sensor';
    override readonly priority = 110;

    async run(): Promise<void> {
        const requiredUnits = [...new Set(SENSORS.map((s) => s.unit))];
        const existingUnits = await db
            .select({ value: sensorUnit.value })
            .from(sensorUnit);
        const knownUnits = new Set(existingUnits.map((u) => u.value));
        const unitsToInsert = requiredUnits
            .filter((v) => !knownUnits.has(v))
            .map((value) => ({ value }));
        if (unitsToInsert.length > 0) {
            const q1 = db.insert(sensorUnit).values(unitsToInsert);
            await q1;
        }

        const existing = await db.select({ name: sensor.name }).from(sensor);
        const existingNames = new Set(existing.map((s) => s.name));
        const toInsert = SENSORS.filter((s) => !existingNames.has(s.name));
        if (toInsert.length > 0) {
            const q2 = db.insert(sensor).values(toInsert);
            await q2;
        }
    }
}
