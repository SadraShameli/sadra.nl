import { type Plan } from '../core';
import { serializePlanRules } from './PlanRulesSerialization';

export const PLAN_RULES_FINGERPRINT_LENGTH = 64;

export async function planRulesFingerprint(plan: Plan): Promise<string> {
    return sha256Hex(serializePlanRules(plan));
}

async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}
