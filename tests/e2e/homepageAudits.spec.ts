import { expect, test } from '@playwright/test';

const MAX_POSTER_BYTES = 64 * 1024;
const MAX_POSTER_WIDTH = 1200;
const MAX_POSTER_HEIGHT = 900;

test('the Sensor Hub menu opens its portfolio tab across pages and after another selection', async ({
    page,
}) => {
    await page.goto('/portfolio');
    const menu = page.getByRole('navigation', { exact: true, name: 'Main' });
    const portfolio = page.locator('#portfolio');
    for (let navigation = 0; navigation < 2; navigation++) {
        await menu
            .getByRole('button', { exact: true, name: 'Sensor Hub' })
            .click();
        await menu.getByRole('link', { name: /^sensor hub$/i }).click();
        await expect(page).toHaveURL(/\?project=sensor-hub#portfolio$/);
        await expect(
            portfolio.getByRole('tab', { exact: true, name: 'Sensor Hub' }),
        ).toHaveAttribute('aria-selected', 'true');
        await portfolio
            .getByRole('tab', { exact: true, name: 'Mino Markt' })
            .click();
        await expect(page).toHaveURL(/\?project=mino-markt#portfolio$/);
    }
    await page.reload();
    await expect(
        portfolio.getByRole('tab', { exact: true, name: 'Mino Markt' }),
    ).toHaveAttribute('aria-selected', 'true');
});

test('the portfolio showcase supports project selection and keyboard navigation', async ({
    page,
}) => {
    await page.goto('/');
    const portfolio = page.locator('#portfolio');
    await expect(
        portfolio.getByRole('tablist', { name: 'Selected projects' }),
    ).toBeVisible();
    await expect(
        portfolio.getByRole('tabpanel', { exact: true, name: 'TradingBot' }),
    ).toBeVisible();
    await expect(portfolio.getByRole('tab')).toHaveText([
        'TradingBot',
        'Sensor Hub',
        'Project A.I.',
        'Mino Markt',
    ]);
    await portfolio
        .getByRole('tab', { exact: true, name: 'TradingBot' })
        .press('ArrowRight');
    await expect(
        portfolio.getByRole('tabpanel', { exact: true, name: 'Sensor Hub' }),
    ).toBeVisible();
    await portfolio
        .getByRole('tab', { exact: true, name: 'Sensor Hub' })
        .press('ArrowRight');
    const robot = portfolio.getByRole('tabpanel', {
        exact: true,
        name: 'Project A.I.',
    });
    await expect(robot).toBeVisible();
    await expect(
        robot.getByRole('link', { name: 'View project' }),
    ).toHaveAttribute('href', 'https://github.com/SadraShameli/ProjectAI');
    await portfolio
        .getByRole('tab', { exact: true, name: 'Mino Markt' })
        .click();
    const market = portfolio.getByRole('tabpanel', {
        exact: true,
        name: 'Mino Markt',
    });
    await expect(market).toBeVisible();
    await expect(market.getByRole('list')).toHaveCount(0);
    await expect(
        portfolio.getByRole('link', { name: 'Explore the portfolio' }),
    ).toHaveAttribute('href', '/portfolio');
    await expect(
        page
            .getByRole('navigation', { exact: true, name: 'Index' })
            .getByRole('link', {
                exact: true,
                name: 'Portfolio',
            }),
    ).toHaveAttribute('href', '/#portfolio');
});

test('the gallery starts continuous scrolling on entry and stops at the end', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const gallery = page.locator('[aria-roledescription="carousel"]');
    const play = gallery.getByRole('button', {
        exact: true,
        name: 'Play slideshow',
    });
    const pause = gallery.getByRole('button', {
        exact: true,
        name: 'Pause slideshow',
    });
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await gallery.scrollIntoViewIfNeeded();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    const firstImage = gallery.locator('img').first();
    const initial = await firstImage.boundingBox();
    if (!initial) throw new Error('The first gallery image is not visible');
    await expect
        .poll(
            async () => {
                const bounds = await firstImage.boundingBox();
                return bounds?.x;
            },
            { timeout: 2500 },
        )
        .toBeLessThan(initial.x - 10);
    await pause.click();
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await play.click();
    const next = gallery.getByRole('button', {
        exact: true,
        name: 'Next photo',
    });
    const imageCount = await gallery.locator('img').count();
    for (
        let index = 0;
        index < imageCount && (await next.isEnabled());
        index++
    ) {
        await next.click();
    }
    await expect(next).toBeDisabled();
    await expect(play).toBeDisabled();
});

test('recording controls expose distinct accessible slider names', async ({
    page,
}) => {
    await page.goto('/');
    await expect(
        page.getByRole('slider', { exact: true, name: 'Playback position' }),
    ).toBeVisible();
    await expect(
        page.getByRole('slider', { exact: true, name: 'Playback volume' }),
    ).toBeVisible();
});

test('video posters stay within the homepage image delivery budget', async ({
    page,
    request,
}) => {
    await page.goto('/');
    const posters = await page
        .locator('video[poster]')
        .evaluateAll((videos) =>
            videos.map((video) => video.getAttribute('poster')),
        );
    expect(posters).toHaveLength(2);
    for (const poster of posters) {
        expect(poster).not.toBeNull();
        if (poster === null) throw new Error('Missing video poster');
        const response = await request.get(poster);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toMatch(
            /^image\/(avif|webp)/,
        );
        const body = await response.body();
        expect(body.byteLength).toBeLessThan(MAX_POSTER_BYTES);
        const dimensions = await page.evaluate(async (source) => {
            const image = globalThis.document.createElement('img');
            image.src = source;
            await image.decode();
            return { height: image.naturalHeight, width: image.naturalWidth };
        }, poster);
        expect(dimensions.width).toBeLessThanOrEqual(MAX_POSTER_WIDTH);
        expect(dimensions.height).toBeLessThanOrEqual(MAX_POSTER_HEIGHT);
    }
});
