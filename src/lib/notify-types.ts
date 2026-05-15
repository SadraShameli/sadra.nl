export type EventType =
    | 'device_created'
    | 'location_created'
    | 'reading_created'
    | 'recording_created';

export const EVENT_TYPES: readonly EventType[] = [
    'device_created',
    'location_created',
    'reading_created',
    'recording_created',
] as const;

export const EVENT_LABELS: Record<EventType, string> = {
    device_created: 'New device registered',
    location_created: 'New location created',
    reading_created: 'New sensor reading',
    recording_created: 'New recording uploaded',
};
