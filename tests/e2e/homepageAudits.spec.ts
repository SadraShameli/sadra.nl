import { expect, test } from '@playwright/test';

const MAX_POSTER_BYTES = 64 * 1024;
const MAX_POSTER_WIDTH = 1200;
const MAX_POSTER_HEIGHT = 900;

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
