import { expect, test } from '@playwright/test';

test('homepage renders hero', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sadra/);
    await expect(page.locator('h1, [role="heading"]').first()).toBeVisible();
});

test('robots route returns rules', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-Agent');
    expect(body).not.toContain('acme.com');
});

test('sitemap route exposes static paths', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('/portfolio');
    expect(body).toContain('/prop-calculator');
});

test('health endpoint reports ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect([200, 503]).toContain(res.status());
    const body = (await res.json()) as { status: string };
    expect(['ok', 'degraded']).toContain(body.status);
});

test('iot ingest rejects requests without a device token', async ({
    request,
}) => {
    const res = await request.post('/api/reading', {
        data: { device_id: 1, sensors: { '1': 42 } },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
});
