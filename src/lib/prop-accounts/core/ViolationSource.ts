export enum ViolationSource {
    Detected = 'detected',
    Manual = 'manual',
}

const VIOLATION_SOURCE_LABEL: Readonly<Record<ViolationSource, string>> = {
    [ViolationSource.Detected]: 'Detected from your journal',
    [ViolationSource.Manual]: 'Logged by you',
};

export function violationSourceLabel(value: ViolationSource): string {
    return VIOLATION_SOURCE_LABEL[value];
}
