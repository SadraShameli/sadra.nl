import { expect, test } from '@playwright/test';

test('login form shows a field error on an empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { exact: true, name: 'Sign in' }).click();
    await expect(
        page.getByText('Password is required', { exact: true }),
    ).toBeVisible();
});
