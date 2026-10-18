import { describe, expect, it } from 'vitest';

import {
    DEFAULT_FOOTER_VARIANT,
    FooterVariant,
    footerVariantFor,
} from '~/app/(app)/_components/footerVariant';
import { siteTools } from '~/lib/site/content';
import { PRIVATE_PREFIXES } from '~/lib/site/privateRoutes';
import { indexableRoutes, routes } from '~/lib/site/routes';

const FULL_FOOTER_PATHS: readonly string[] = [
    routes.home,
    routes.portfolio,
    routes.resume.index,
];

const COMPACT_FOOTER_PATHS: readonly string[] = [
    ...PRIVATE_PREFIXES,
    ...Object.values(routes.auth),
    ...Object.values(routes.legal),
    ...indexableRoutes.filter((path) => !FULL_FOOTER_PATHS.includes(path)),
    ...siteTools
        .map((tool) => tool.href)
        .filter((path) => !FULL_FOOTER_PATHS.includes(path)),
    routes.contact,
    routes.profile,
    routes.accounting.run('run-1'),
    routes.lifting.workout('workout-1'),
    routes.propCalculator.accounts.detail('account-1'),
];

describe('footerVariantFor', () => {
    it.each(FULL_FOOTER_PATHS)('shows the full footer on %s', (path) => {
        expect(footerVariantFor(path)).toBe(FooterVariant.Full);
    });

    it.each(COMPACT_FOOTER_PATHS)('shows the compact footer on %s', (path) => {
        expect(footerVariantFor(path)).toBe(FooterVariant.Compact);
    });

    it('keeps the full footer to the showcase page itself, not paths below it', () => {
        expect(footerVariantFor(`${routes.portfolio}/notes`)).toBe(
            FooterVariant.Compact,
        );
        expect(footerVariantFor(routes.resume.pdf('sadra'))).toBe(
            FooterVariant.Compact,
        );
    });

    it('falls back to the compact footer for a path the site does not know', () => {
        expect(footerVariantFor('/no-such-page')).toBe(DEFAULT_FOOTER_VARIANT);
        expect(DEFAULT_FOOTER_VARIANT).toBe(FooterVariant.Compact);
    });
});
