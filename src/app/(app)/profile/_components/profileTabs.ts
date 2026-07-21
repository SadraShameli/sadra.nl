import { PROFILE_TAB_VALUES } from '~/lib/schemas/url';

export type ProfileTabValue = (typeof PROFILE_TAB_VALUES)[number];

export function normalizeProfileTab(
    raw: string | string[] | undefined,
    isAdmin: boolean,
): ProfileTabValue {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!isAdmin && (value === 'sensor-hub' || value === 'users'))
        return 'account';

    return (PROFILE_TAB_VALUES as readonly string[]).includes(value ?? '')
        ? (value as ProfileTabValue)
        : 'account';
}
