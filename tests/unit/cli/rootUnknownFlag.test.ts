import { beforeAll, describe, expect, it } from 'vitest';

import { main } from '~/cli/index';
import { findUnknownFlag, unknownFlagMessage } from '~/cli/unknownFlagGuard';

const COLD_IMPORT_TIMEOUT_MS = 10_000;

beforeAll(async () => {
    await findUnknownFlag(['prop', 'sim', '--warmup'], main, 'cli');
}, COLD_IMPORT_TIMEOUT_MS);

describe('the real root command rejects a flag typed before a subcommand (N-78 leading flags)', () => {
    it('rejects a bogus flag before the prop group: cli --bogus prop sim', async () => {
        const issue = await findUnknownFlag(
            ['--bogus', 'prop', 'sim'],
            main,
            'cli',
        );

        expect(issue).not.toBeNull();
        expect(issue?.flag).toBe('--bogus');
        expect(issue?.commandPath).toBe('cli');
    });

    it('rejects a bogus flag between the prop group and its subcommand: cli prop --bogus plans', async () => {
        const issue = await findUnknownFlag(
            ['prop', '--bogus', 'plans'],
            main,
            'cli',
        );

        expect(issue).not.toBeNull();
        expect(issue?.flag).toBe('--bogus');
        expect(issue?.commandPath).toBe('cli prop');
    });

    it('rejects a leaf flag typed one level too early: cli prop --firm topstep sim', async () => {
        const issue = await findUnknownFlag(
            ['prop', '--firm', 'topstep', 'sim'],
            main,
            'cli',
        );

        expect(issue?.flag).toBe('--firm');
        expect(issue?.commandPath).toBe('cli prop');
    });

    it('rejects a bogus flag at the optimize group: cli prop optimize --bogus dp', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'optimize', '--bogus', 'dp'],
            main,
            'cli',
        );

        expect(issue?.flag).toBe('--bogus');
        expect(issue?.commandPath).toBe('cli prop optimize');
    });

    it('rejects a bogus flag at the bankroll group: cli prop bankroll --bogus batch', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'bankroll', '--bogus', 'batch'],
            main,
            'cli',
        );

        expect(issue?.flag).toBe('--bogus');
        expect(issue?.commandPath).toBe('cli prop bankroll');
    });

    it('rejects a bogus flag at a group that is given no subcommand: cli prop --bogus', async () => {
        const issue = await findUnknownFlag(['prop', '--bogus'], main, 'cli');

        expect(issue?.flag).toBe('--bogus');
        expect(issue?.commandPath).toBe('cli prop');
    });

    it('rejects a bogus flag before an unknown subcommand name, so the flag is not the one silently lost', async () => {
        const issue = await findUnknownFlag(
            ['prop', '--bogus', 'not-a-command'],
            main,
            'cli',
        );

        expect(issue?.flag).toBe('--bogus');
    });

    it('rejects a --flag=value form before a subcommand', async () => {
        const issue = await findUnknownFlag(
            ['prop', '--firm=topstep', 'sim'],
            main,
            'cli',
        );

        expect(issue?.flag).toBe('--firm=topstep');
    });

    it.each([
        ['--help', 'prop'],
        ['-h', 'prop'],
        ['--version', 'prop'],
    ])('lets the builtin %s pass before a subcommand', async (flag, group) => {
        const issue = await findUnknownFlag([flag, group, 'sim'], main, 'cli');

        expect(issue).toBeNull();
    });

    it('still passes a clean command line through the real root', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'sim', '--trials', '10'],
            main,
            'cli',
        );

        expect(issue).toBeNull();
    });

    it('still rejects a bogus flag on the leaf through the real root', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'sim', '--bogus'],
            main,
            'cli',
        );

        expect(issue?.commandPath).toBe('cli prop sim');
    });
});

describe('closestDeclaredFlag suggests only within a similarity threshold (N-78)', () => {
    it('suggests nothing for a flag that resembles no declared flag', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'sim', '--totally-bogus-flag'],
            main,
            'cli',
        );

        if (issue === null) throw new Error('no unknown flag found');
        expect(issue.flag).toBe('--totally-bogus-flag');
        expect(issue.suggestion).toBeNull();
        expect(unknownFlagMessage(issue)).not.toContain('closest');
    });

    it('still suggests a declared flag one typo away', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'sim', '--trals', '10'],
            main,
            'cli',
        );

        expect(issue?.suggestion).toBe('trials');
    });

    it('suggests nothing for a one-letter flag', async () => {
        const issue = await findUnknownFlag(
            ['prop', 'sim', '--z'],
            main,
            'cli',
        );

        expect(issue?.suggestion).toBeNull();
    });
});
