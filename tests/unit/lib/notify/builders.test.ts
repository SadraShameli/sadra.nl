import { describe, expect, it } from 'vitest';

import { DeviceCreatedEmail } from '~/lib/email/messages/device-created';
import { LocationCreatedEmail } from '~/lib/email/messages/location-created';
import { LoudnessAlertEmail } from '~/lib/email/messages/loudness-alert';
import { ReadingCreatedEmail } from '~/lib/email/messages/reading-created';
import { RecordingCreatedEmail } from '~/lib/email/messages/recording-created';

describe('DeviceCreatedEmail', () => {
    it('has the correct subject', () => {
        const email = new DeviceCreatedEmail('user@example.com', {
            deviceId: 7,
            deviceName: 'Garden Sensor',
            locationName: 'Garden',
        });
        expect(email.subject).toBe('New device — sadra.nl');
        expect(email.to).toBe('user@example.com');
    });

    it('renders device info into HTML', async () => {
        const email = new DeviceCreatedEmail('user@example.com', {
            deviceId: 7,
            deviceName: 'Garden Sensor',
            locationName: 'Garden',
        });
        const html = await email.render();
        expect(html).toContain('Garden Sensor');
        expect(html).toContain('7');
        expect(html).toContain('Garden');
    });

    it('falls back to dash when location is null', async () => {
        const email = new DeviceCreatedEmail('user@example.com', {
            deviceId: 1,
            deviceName: 'X',
            locationName: null,
        });
        const html = await email.render();
        expect(html).toContain('—');
    });
});

describe('LocationCreatedEmail', () => {
    it('has the correct subject', () => {
        const email = new LocationCreatedEmail('user@example.com', {
            locationId: 42,
            locationName: 'Office',
        });
        expect(email.subject).toBe('New location — sadra.nl');
    });

    it('renders name and id', async () => {
        const email = new LocationCreatedEmail('user@example.com', {
            locationId: 42,
            locationName: 'Office',
        });
        const html = await email.render();
        expect(html).toContain('Office');
        expect(html).toContain('42');
    });
});

describe('LoudnessAlertEmail', () => {
    it('has the correct subject', () => {
        const email = new LoudnessAlertEmail('user@example.com', {
            deviceName: 'D1',
            locationName: 'Living Room',
            threshold: 80,
            value: 102,
        });
        expect(email.subject).toBe('Loudness alert — sadra.nl');
    });

    it('renders value and threshold', async () => {
        const email = new LoudnessAlertEmail('user@example.com', {
            deviceName: 'D1',
            locationName: 'Living Room',
            threshold: 80,
            value: 102,
        });
        const html = await email.render();
        expect(html).toContain('D1');
        expect(html).toContain('Living Room');
        expect(html).toContain('102');
        expect(html).toContain('80');
    });

    it('falls back to dashes for null device/location', async () => {
        const email = new LoudnessAlertEmail('user@example.com', {
            deviceName: null,
            locationName: null,
            threshold: 50,
            value: 90,
        });
        const html = await email.render();
        expect(html.match(/—/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    });
});

describe('ReadingCreatedEmail', () => {
    it('has the correct subject', () => {
        const email = new ReadingCreatedEmail('user@example.com', {
            deviceName: 'D1',
            locationName: 'L1',
            sensorReadings: [],
        });
        expect(email.subject).toBe('New reading — sadra.nl');
    });

    it('renders each sensor reading', async () => {
        const email = new ReadingCreatedEmail('user@example.com', {
            deviceName: 'D1',
            locationName: 'L1',
            sensorReadings: [
                { name: 'Temp', unit: 'C', value: 21.5 },
                { name: 'Loudness', unit: null, value: 85 },
            ],
        });
        const html = await email.render();
        expect(html).toContain('Temp');
        expect(html).toContain('21.5');
        expect(html).toContain('C');
        expect(html).toContain('Loudness');
        expect(html).toContain('85');
    });

    it('renders without crashing when readings array is empty', async () => {
        const email = new ReadingCreatedEmail('user@example.com', {
            deviceName: 'D1',
            locationName: 'L1',
            sensorReadings: [],
        });
        await expect(email.render()).resolves.toBeTruthy();
    });
});

describe('RecordingCreatedEmail', () => {
    it('has the correct subject', () => {
        const email = new RecordingCreatedEmail('user@example.com', {
            deviceName: 'D1',
            durationSeconds: 12.4,
            fileName: 'clip.wav',
            locationName: 'L1',
        });
        expect(email.subject).toBe('New recording — sadra.nl');
    });

    it('renders filename with rounded duration when provided', async () => {
        const email = new RecordingCreatedEmail('user@example.com', {
            deviceName: 'D1',
            durationSeconds: 12.4,
            fileName: 'clip.wav',
            locationName: 'L1',
        });
        const html = await email.render();
        expect(html).toContain('clip.wav');
        expect(html).toContain('12s');
    });

    it('omits duration suffix when null', async () => {
        const email = new RecordingCreatedEmail('user@example.com', {
            deviceName: 'D1',
            durationSeconds: null,
            fileName: 'clip.wav',
            locationName: 'L1',
        });
        const html = await email.render();
        expect(html).toContain('clip.wav');
        expect(html).not.toMatch(/\(\d+s\)/);
    });
});
