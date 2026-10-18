import { describe, expect, it, vi } from 'vitest';

import { metadata as portfolioMetadata } from '~/app/(app)/portfolio/page';
import { metadata as resumeMetadata } from '~/app/(app)/resume/page';
import { siteContent } from '~/lib/site/content';

vi.mock('~/lib/auth/guards', () => ({ requireRootUser: vi.fn() }));
vi.mock('~/lib/auth/session', () => ({ readSession: vi.fn() }));

function browserTitle(title: unknown): string {
    if (typeof title !== 'string') throw new TypeError('expected a page title');
    return `${title} · ${siteContent.metaTitle}`;
}

describe('public page titles', () => {
    it('names the resume page instead of falling back to the site name', () => {
        expect(browserTitle(resumeMetadata.title)).toBe(
            'Resume · Sadra Shameli',
        );
    });

    it('names the portfolio page once instead of repeating the site name', () => {
        expect(browserTitle(portfolioMetadata.title)).toBe(
            'Portfolio · Sadra Shameli',
        );
    });
});
