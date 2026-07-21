import { expect, test } from '@playwright/test';

test('homepage renders hero', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sadra/);
    await expect(page.locator('h1, [role="heading"]').first()).toBeVisible();
});

test('robots route returns rules', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('User-Agent');
    expect(body).not.toContain('acme.com');
});

test('sitemap route exposes static paths', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('/portfolio');
    expect(body).toContain('/prop-calculator');
});

test('health endpoint reports ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect([200, 503]).toContain(response.status());
    const body = (await response.json()) as { status: string };
    expect(['ok', 'degraded']).toContain(body.status);
});

test('iot ingest rejects requests without a device token', async ({
    request,
}) => {
    const response = await request.post('/api/reading', {
        data: { device_id: 1, sensors: { '1': 42 } },
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
});
