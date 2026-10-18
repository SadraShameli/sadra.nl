import { instant } from '@next/playwright';
import { expect, test } from '@playwright/test';

import { signInAsRoot } from '../support/rootSession';

test('accounting dashboard shell commits under instant()', async ({
    baseURL,
    page,
}) => {
    if (baseURL === undefined) throw new TypeError('baseURL is not set');
    await signInAsRoot(page, baseURL);
    const runControls = page
        .locator('#main-content')
        .getByText('Run controls', { exact: true });

    await instant(
        page,
        async () => {
            await page.goto('/accounting');
            await expect(
                page.getByRole('heading', {
                    exact: true,
                    level: 1,
                    name: 'Accounting Importer',
                }),
            ).toBeVisible();
            await expect(
                page.getByRole('link', { exact: true, name: 'Connections' }),
            ).toBeVisible();
            await expect(runControls).toHaveCount(0);
        },
        { baseURL },
    );

    await page.reload();
    await expect(runControls).toBeVisible();
});
