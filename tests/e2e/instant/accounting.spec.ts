import { instant } from '@next/playwright';
import { expect, test } from '@playwright/test';

import { signInAsRoot } from '../support/rootSession';

test('accounting dashboard shell commits under instant()', async ({
    baseURL,
    page,
}) => {
    if (baseURL === undefined) throw new TypeError('baseURL is not set');
    await signInAsRoot(page, baseURL);
    const newRunPanel = page
        .locator('#main-content')
        .getByRole('heading', { exact: true, name: 'New run' });

    await instant(
        page,
        async () => {
            await page.goto('/accounting');
            await expect(
                page.getByRole('heading', {
                    exact: true,
                    level: 1,
                    name: 'Run an import',
                }),
            ).toBeVisible();
            await expect(
                page.getByRole('link', { exact: true, name: 'Connections' }),
            ).toBeVisible();
            await expect(newRunPanel).toHaveCount(0);
        },
        { baseURL },
    );

    await page.reload();
    await expect(newRunPanel).toBeVisible();
});
