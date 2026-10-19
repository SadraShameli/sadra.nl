import { expect, test } from '@playwright/test';
import { z } from 'zod';

const identityEntitySchema = z.object({
    '@type': z.string(),
    name: z.string(),
});

const identitySchema = z.object({
    '@graph': z.array(identityEntitySchema),
});

test('homepage identifies Sadra Shameli consistently for search and sharing', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Sadra Shameli | Daytrader & Developer');
    await expect(page.locator('h1')).toContainText('Sadra Shameli');
    const description = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
    expect(description?.length).toBeGreaterThan(100);
    expect(description).toContain('Sadra Shameli');
    expect(description).toMatch(/daytrader and developer/);
    expect(description).not.toMatch(/wordpress|front.?end|full.?stack/i);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        /\/opengraph-image/,
    );
    const identity = identitySchema.parse(
        JSON.parse(
            (await page
                .locator('script[type="application/ld+json"]')
                .textContent()) ?? '',
        ),
    );
    expect(identity['@graph']).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                '@type': 'Person',
                name: 'Sadra Shameli',
            }),
            expect.objectContaining({
                '@type': 'WebSite',
                name: 'Sadra Shameli',
            }),
        ]),
    );
});

test('portfolio has its own description and matching social metadata', async ({
    page,
}) => {
    await page.goto('/portfolio');
    await expect(page).toHaveTitle('Portfolio · Sadra Shameli');
    await expect(page.locator('main')).not.toContainText(
        /wordpress|front.?end|full.?stack/i,
    );
    const description = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
    expect(description?.length).toBeGreaterThan(100);
    expect(description).toContain('Sadra Shameli');
    expect(description).toMatch(/daytrader and developer/);
    expect(description).not.toMatch(/wordpress|front.?end|full.?stack/i);
    await expect(
        page.locator('meta[name="twitter:description"]'),
    ).toHaveAttribute('content', description ?? '');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        /\/opengraph-image/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        /\/portfolio$/,
    );
});

test('the sitemap excludes routes that require signing in', async ({
    request,
}) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain('/trade-checklist');
});

test('sign-in pages are excluded from search results', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/,
    );
});
