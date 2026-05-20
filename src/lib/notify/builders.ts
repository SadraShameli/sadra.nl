export function buildDeviceEmail(params: {
    deviceId: number;
    deviceName: string;
    locationName: null | string;
}) {
    return {
        html: `
<p>A new device was registered.</p>
<p><strong>Name:</strong> ${params.deviceName}</p>
<p><strong>Device ID:</strong> ${params.deviceId}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
        `.trim(),
        subject: 'New device — sadra.nl',
    };
}

export function buildLocationEmail(params: {
    locationId: number;
    locationName: string;
}) {
    return {
        html: `
<p>A new location was created.</p>
<p><strong>Name:</strong> ${params.locationName}</p>
<p><strong>ID:</strong> ${params.locationId}</p>
        `.trim(),
        subject: 'New location — sadra.nl',
    };
}

export function buildLoudnessAlertEmail(params: {
    deviceName: null | string;
    locationName: null | string;
    threshold: number;
    value: number;
}) {
    return {
        html: `
<p>Loudness threshold exceeded.</p>
<p><strong>Device:</strong> ${params.deviceName ?? '—'}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
<p><strong>Value:</strong> ${params.value}</p>
<p><strong>Threshold:</strong> ${params.threshold}</p>
        `.trim(),
        subject: 'Loudness alert — sadra.nl',
    };
}

export function buildReadingEmail(params: {
    deviceName: null | string;
    locationName: null | string;
    sensorReadings: { name: string; unit: null | string; value: number }[];
}) {
    const rows = params.sensorReadings
        .map(
            (r) =>
                `<li><strong>${r.name}:</strong> ${r.value}${r.unit ? ` ${r.unit}` : ''}</li>`,
        )
        .join('');
    return {
        html: `
<p>A new reading was received.</p>
<p><strong>Device:</strong> ${params.deviceName ?? '—'}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
<ul>${rows}</ul>
        `.trim(),
        subject: 'New reading — sadra.nl',
    };
}

export function buildRecordingEmail(params: {
    deviceName: null | string;
    durationSeconds: null | number | undefined;
    fileName: string;
    locationName: null | string;
}) {
    const dur =
        params.durationSeconds == null
            ? ''
            : ` (${Math.round(params.durationSeconds)}s)`;
    return {
        html: `
<p>A new recording was received.</p>
<p><strong>File:</strong> ${params.fileName}${dur}</p>
<p><strong>Device:</strong> ${params.deviceName ?? '—'}</p>
<p><strong>Location:</strong> ${params.locationName ?? '—'}</p>
        `.trim(),
        subject: 'New recording — sadra.nl',
    };
}
