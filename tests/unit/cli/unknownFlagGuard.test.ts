import { describe, expect, it } from 'vitest';

import propGroup from '~/cli/commands/prop/group';
import { findUnknownFlag, unknownFlagMessage } from '~/cli/unknownFlagGuard';

describe('findUnknownFlag (N-78: the CLI silently accepted unknown flags)', () => {
    it('rejects an unknown flag on optimize dp instead of running with defaults', async () => {
        const issue = await findUnknownFlag(
            [
                'optimize',
                'dp',
                '--stop-points',
                '4',
                '--instrument',
                'ES',
                '--totally-bogus-flag',
                '7',
            ],
            propGroup,
            'cli prop',
        );

        expect(issue).not.toBeNull();
        expect(issue?.flag).toBe('--totally-bogus-flag');
        expect(issue?.commandPath).toBe('cli prop optimize dp');
    });

    it('rejects an unknown flag on any other prop command (sim), not only optimize dp', async () => {
        const issue = await findUnknownFlag(
            ['sim', '--totally-bogus-flag'],
            propGroup,
            'cli prop',
        );

        expect(issue).not.toBeNull();
        expect(issue?.commandPath).toBe('cli prop sim');
    });

    it('rejects an unknown flag two levels deep under bankroll', async () => {
        const issue = await findUnknownFlag(
            ['bankroll', 'batch', '--totally-bogus-flag'],
            propGroup,
            'cli prop',
        );

        expect(issue).not.toBeNull();
        expect(issue?.commandPath).toBe('cli prop bankroll batch');
    });

    it('suggests the closest declared flag by edit distance', async () => {
        const issue = await findUnknownFlag(
            ['sim', '--trals', '100'],
            propGroup,
            'cli prop',
        );

        expect(issue?.suggestion).toBe('trials');
    });

    it('lets a declared flag, its alias-free kebab form and value pass through unharmed', async () => {
        const issue = await findUnknownFlag(
            ['sim', '--trials', '100', '--firm', 'topstep'],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });

    it('still accepts a --no- negation of a declared boolean flag', async () => {
        const issue = await findUnknownFlag(
            ['optimize', 'dp', '--no-early-withdrawal'],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });

    it('rejects a --no- negation of a flag that was never declared', async () => {
        const issue = await findUnknownFlag(
            ['optimize', 'dp', '--no-totally-bogus-flag'],
            propGroup,
            'cli prop',
        );

        expect(issue).not.toBeNull();
    });

    it('accepts a negative number as the value of a declared string flag (N-78 follow-up)', async () => {
        const issue = await findUnknownFlag(
            [
                'optimize',
                'dp',
                '--firm',
                'topstep',
                '--variant',
                'no-fee-standard',
                '--seed',
                '-5',
            ],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });

    it('accepts a negative number as the value of a declared string flag on live (N-78 follow-up)', async () => {
        const issue = await findUnknownFlag(
            ['live', '--seed', '-7'],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });

    it('returns null (no opinion) for an unknown top-level command, leaving citty to report it', async () => {
        const issue = await findUnknownFlag(
            ['not-a-real-command'],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });
});

describe('findUnknownFlag on prop ladder (WP46b: N-78 follow-up, WP15 handoff)', () => {
    it('accepts a funded-only flag ladder deliberately does not support, so prop ladder can give its own reason instead of the generic message', async () => {
        const issue = await findUnknownFlag(
            ['ladder', '--retain-cushion', '2000'],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });

    it.each([
        '--early-withdrawal',
        '--funded-days',
        '--idle-day-probability',
        '--path-granularity',
        '--rebuy-lag-days',
        '--request-size',
        '--risk',
        '--tpd',
        '--ladder',
        '--max-attempts',
        '--max-lifetime-payouts',
    ])('accepts %s on prop ladder too, for the same reason', async (flag) => {
        const issue = await findUnknownFlag(
            ['ladder', flag, '1'],
            propGroup,
            'cli prop',
        );

        expect(issue).toBeNull();
    });

    it.each(['--funded-risk', '--retain-cushion'])(
        'accepts a negative number as the value of a funded-only flag %s that prop ladder does not declare as a CLI argument (WP46c follow-up)',
        async (flag) => {
            const issue = await findUnknownFlag(
                ['ladder', flag, '-500'],
                propGroup,
                'cli prop',
            );

            expect(issue).toBeNull();
        },
    );

    it('still rejects a truly unknown flag on prop ladder with the generic message', async () => {
        const issue = await findUnknownFlag(
            ['ladder', '--totally-bogus-flag'],
            propGroup,
            'cli prop',
        );

        expect(issue).not.toBeNull();
        expect(issue?.commandPath).toBe('cli prop ladder');
        expect(issue?.flag).toBe('--totally-bogus-flag');
    });
});

describe('unknownFlagMessage', () => {
    it('names the flag and the full command path, with a closest-match hint, no em dash', () => {
        const message = unknownFlagMessage({
            commandPath: 'cli prop optimize dp',
            flag: '--totally-bogus-flag',
            suggestion: 'stop-points',
        });

        expect(message).toContain('--totally-bogus-flag');
        expect(message).toContain('cli prop optimize dp');
        expect(message).toContain('--stop-points');
        expect(message).not.toContain('\u{2014}');
    });

    it('omits the hint sentence when nothing is a plausible match', () => {
        const message = unknownFlagMessage({
            commandPath: 'cli prop sim',
            flag: '--z',
            suggestion: null,
        });

        expect(message).toContain('--z');
        expect(message).not.toContain('closest');
    });
});
