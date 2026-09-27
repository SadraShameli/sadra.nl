import { dayNumberOf } from '../lib/isoDate';

export enum PolicySourceKind {
    LiveFetch = 'live-fetch',
    UserPaste = 'user-paste',
}

export enum PolicyVerification {
    Confirmed = 'confirmed',
    Conflict = 'conflict',
    NeedsPaste = 'needs-paste',
    NotFound = 'not-found',
}

export interface ConfirmedFirmPolicySource extends PolicyQuote {
    readonly verification: PolicyVerification.Confirmed;
}

export interface ConflictFirmPolicySource extends PolicyQuote {
    readonly conflicting: PolicyQuote;
    readonly verification: PolicyVerification.Conflict;
}

export type FirmPolicySource =
    | ConfirmedFirmPolicySource
    | ConflictFirmPolicySource
    | NeedsPasteFirmPolicySource
    | NotFoundFirmPolicySource;

export interface NeedsPasteFirmPolicySource {
    readonly verification: PolicyVerification.NeedsPaste;
}

export interface NotFoundFirmPolicySource {
    readonly verification: PolicyVerification.NotFound;
}

export interface PolicyQuote {
    readonly fetchedOn: string;
    readonly quote: string;
    readonly sourceKind: PolicySourceKind;
    readonly url: string;
}

const HTTPS_URL_PREFIX = 'https://';

export function assertValidFirmPolicySource(
    source: FirmPolicySource,
    label: string,
): void {
    switch (source.verification) {
        case PolicyVerification.Confirmed: {
            assertValidPolicyQuote(source, label);
            return;
        }
        case PolicyVerification.Conflict: {
            assertValidPolicyQuote(source, label);
            assertValidPolicyQuote(
                source.conflicting,
                `${label} (conflicting quote)`,
            );
            return;
        }
        case PolicyVerification.NeedsPaste:
        case PolicyVerification.NotFound: {
            return;
        }
    }
}

function assertValidPolicyQuote(quote: PolicyQuote, label: string): void {
    if (quote.quote.trim().length === 0) {
        throw new Error(`${label}: quote must not be empty`);
    }
    if (!quote.url.startsWith(HTTPS_URL_PREFIX)) {
        throw new Error(
            `${label}: url must be an https URL, got "${quote.url}"`,
        );
    }
    dayNumberOf(quote.fetchedOn);
}
