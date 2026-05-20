import { describe, expect, it } from 'vitest';

import {
    buildDeviceEmail,
    buildLocationEmail,
    buildLoudnessAlertEmail,
    buildReadingEmail,
    buildRecordingEmail,
} from '~/lib/notify/builders';

describe('buildDeviceEmail', () => {
    it('renders all fields with a location', () => {
        const { html, subject } = buildDeviceEmail({
            deviceId: 7,
            deviceName: 'Garden Sensor',
            locationName: 'Garden',
        });
        expect(subject).toBe('New device — sadra.nl');
        expect(html).toContain('Garden Sensor');
        expect(html).toContain('7');
        expect(html).toContain('Garden');
    });

    it('falls back to dash when location is null', () => {
        const { html } = buildDeviceEmail({
            deviceId: 1,
            deviceName: 'X',
            locationName: null,
        });
        expect(html).toContain('Location:</strong> —');
    });
});

describe('buildLocationEmail', () => {
    it('renders name and id', () => {
        const { html, subject } = buildLocationEmail({
            locationId: 42,
            locationName: 'Office',
        });
        expect(subject).toBe('New location — sadra.nl');
        expect(html).toContain('Office');
        expect(html).toContain('42');
    });
});

describe('buildLoudnessAlertEmail', () => {
    it('renders value and threshold', () => {
        const { html, subject } = buildLoudnessAlertEmail({
            deviceName: 'D1',
            locationName: 'Living Room',
            threshold: 80,
            value: 102,
        });
        expect(subject).toBe('Loudness alert — sadra.nl');
        expect(html).toContain('D1');
        expect(html).toContain('Living Room');
        expect(html).toContain('102');
        expect(html).toContain('80');
    });

    it('falls back to dashes for null device/location', () => {
        const { html } = buildLoudnessAlertEmail({
            deviceName: null,
            locationName: null,
            threshold: 50,
            value: 90,
        });
        expect(html).toContain('Device:</strong> —');
        expect(html).toContain('Location:</strong> —');
    });
});

describe('buildReadingEmail', () => {
    it('renders each sensor as a list item with unit when present', () => {
        const { html, subject } = buildReadingEmail({
            deviceName: 'D1',
            locationName: 'L1',
            sensorReadings: [
                { name: 'Temp', unit: 'C', value: 21.5 },
                { name: 'Loudness', unit: null, value: 85 },
            ],
        });
        expect(subject).toBe('New reading — sadra.nl');
        expect(html).toContain('<li><strong>Temp:</strong> 21.5 C</li>');
        expect(html).toContain('<li><strong>Loudness:</strong> 85</li>');
    });

    it('handles zero readings (empty <ul>)', () => {
        const { html } = buildReadingEmail({
            deviceName: 'D1',
            locationName: 'L1',
            sensorReadings: [],
        });
        expect(html).toContain('<ul></ul>');
    });
});

describe('buildRecordingEmail', () => {
    it('renders filename with rounded duration when provided', () => {
        const { html, subject } = buildRecordingEmail({
            deviceName: 'D1',
            durationSeconds: 12.4,
            fileName: 'clip.wav',
            locationName: 'L1',
        });
        expect(subject).toBe('New recording — sadra.nl');
        expect(html).toContain('clip.wav (12s)');
    });

    it('omits duration when null', () => {
        const { html } = buildRecordingEmail({
            deviceName: 'D1',
            durationSeconds: null,
            fileName: 'clip.wav',
            locationName: 'L1',
        });
        expect(html).toContain('clip.wav');
        expect(html).not.toContain('(NaNs)');
        expect(html).not.toMatch(/\(.+s\)/);
    });
});
