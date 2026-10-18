import { expect, type Page } from '@playwright/test';

class MissingRootCredentialsError extends Error {
    constructor() {
        super(
            'Set E2E_ROOT_EMAIL and E2E_ROOT_PASSWORD to a root account on the database the app under test uses',
        );
        this.name = 'MissingRootCredentialsError';
    }
}

export async function signInAsRoot(page: Page, baseURL: string): Promise<void> {
    const email = process.env.E2E_ROOT_EMAIL;
    const password = process.env.E2E_ROOT_PASSWORD;
    if (email === undefined || password === undefined) {
        throw new MissingRootCredentialsError();
    }
    const response = await page.request.post('/api/auth/sign-in/email', {
        data: { email, password },
        headers: { origin: baseURL },
    });
    expect(response.status()).toBe(200);
}
