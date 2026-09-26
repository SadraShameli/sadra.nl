import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MagicLinkForm } from '~/app/(auth)/_components/MagicLinkForm';
import { OAuthButtons } from '~/app/(auth)/_components/OAuthButtons';
import { LoginForm } from '~/app/(auth)/login/LoginForm';
import { SignupForm } from '~/app/(auth)/signup/SignupForm';
import { routes } from '~/lib/site/routes';

type AuthCall = ReturnType<typeof vi.fn>;

interface AuthPath {
    readonly name: string;
    readonly run: () => Promise<void>;
    readonly sent: AuthCall;
}

interface Mounted {
    readonly container: HTMLDivElement;
    readonly root: Root;
}

interface RejectedCallbackUrl {
    readonly label: string;
    readonly url: null | string;
}

const navigation = vi.hoisted(() => ({
    push: vi.fn(),
    query: { current: new URLSearchParams() },
    refresh: vi.fn(),
}));

const auth = vi.hoisted(() => ({
    email: vi.fn(() => Promise.resolve({ error: null })),
    magicLink: vi.fn(() => Promise.resolve({ error: null })),
    signUpEmail: vi.fn(() => Promise.resolve({ error: null })),
    social: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: navigation.push, refresh: navigation.refresh }),
    useSearchParams: () => navigation.query.current,
}));

vi.mock('~/lib/auth/client', () => ({
    authClient: {
        signIn: {
            email: auth.email,
            magicLink: auth.magicLink,
            social: auth.social,
        },
        signUp: { email: auth.signUpEmail },
    },
}));

const EMAIL = 'owner@example.com';
const PASSWORD = 'Quartz-Lantern-Harbor-97';

const REJECTED_CALLBACK_URLS: readonly RejectedCallbackUrl[] = [
    { label: 'no callbackUrl', url: null },
    { label: 'an empty callbackUrl', url: '' },
    { label: 'a protocol-relative URL', url: '//evil.com' },
    { label: 'a backslash after the slash', url: String.raw`/\evil.com` },
    { label: 'a backslash then a slash', url: String.raw`/\/evil.com` },
    { label: 'an absolute URL', url: 'https://evil.com' },
    { label: 'a script URL', url: 'javascript:alert(1)' },
    { label: 'a NUL character', url: '/accounts\u{0}' },
    { label: 'a tab', url: '/accounts\t' },
    {
        label: 'a header injection',
        url: '/accounts\r\nLocation: https://evil.com',
    },
    { label: 'a path over 512 characters', url: `/${'a'.repeat(600)}` },
];

const ACCEPTED_CALLBACK_URL = '/prop-calculator/accounts/new?firm=apex';

const mounted: Mounted[] = [];

function callbackUrlSentBy(call: AuthCall): unknown {
    const calls: readonly (readonly unknown[])[] = call.mock.calls;
    const argument = calls.at(-1)?.[0];
    return typeof argument === 'object' && argument !== null
        ? Reflect.get(argument, 'callbackURL')
        : undefined;
}

async function clickButton(text: RegExp): Promise<void> {
    const button = [...document.querySelectorAll('button')].find((node) =>
        text.test(node.textContent),
    );
    if (button === undefined) throw new TypeError(`no button ${text}`);
    await act(async () => {
        button.click();
        await settle();
    });
}

function inputNamed(name: string): HTMLInputElement {
    const input = document.querySelector(`input[name="${CSS.escape(name)}"]`);
    if (!(input instanceof HTMLInputElement)) {
        throw new TypeError(`no input named ${name}`);
    }
    return input;
}

async function render(element: ReactElement): Promise<void> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, root });
    await act(async () => {
        root.render(element);
        await settle();
    });
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

async function submitForm(): Promise<void> {
    const form = document.querySelector('form');
    if (form === null) throw new TypeError('no form rendered');
    await act(async () => {
        form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
        );
        await settle();
    });
}

async function typeInto(name: string, value: string): Promise<void> {
    const input = inputNamed(name);
    await act(async () => {
        Reflect.set(HTMLInputElement.prototype, 'value', value, input);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
    });
}

function withCallbackUrl(callbackUrl: null | string): void {
    navigation.query.current =
        callbackUrl === null
            ? new URLSearchParams()
            : new URLSearchParams({ callbackUrl });
}

const AUTH_PATHS: readonly AuthPath[] = [
    {
        name: 'the login form',
        run: async () => {
            await render(<LoginForm />);
            await typeInto('email', EMAIL);
            await typeInto('password', PASSWORD);
            await submitForm();
        },
        sent: auth.email,
    },
    {
        name: 'the signup form',
        run: async () => {
            await render(<SignupForm />);
            await typeInto('name', 'Owner');
            await typeInto('email', EMAIL);
            await typeInto('password', PASSWORD);
            await typeInto('confirm', PASSWORD);
            await submitForm();
        },
        sent: auth.signUpEmail,
    },
    {
        name: 'the magic link form',
        run: async () => {
            await render(<MagicLinkForm />);
            await typeInto('email', EMAIL);
            await submitForm();
        },
        sent: auth.magicLink,
    },
    {
        name: 'the OAuth buttons',
        run: async () => {
            await render(<OAuthButtons hasGithub hasGoogle />);
            await clickButton(/google/i);
        },
        sent: auth.social,
    },
];

beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
});

afterEach(async () => {
    for (const { container, root } of mounted.splice(0)) {
        await act(async () => {
            root.unmount();
            await settle();
        });
        container.remove();
    }
});

describe('callbackUrl on every auth path', () => {
    describe.each(AUTH_PATHS)('$name', ({ run, sent }) => {
        it.each(REJECTED_CALLBACK_URLS)(
            'sends the home route to better-auth for $label',
            async ({ url }) => {
                withCallbackUrl(url);
                await run();
                expect(sent).toHaveBeenCalledTimes(1);
                expect(callbackUrlSentBy(sent)).toBe(routes.home);
            },
        );

        it('keeps a same-origin path with a query', async () => {
            withCallbackUrl(ACCEPTED_CALLBACK_URL);
            await run();
            expect(sent).toHaveBeenCalledTimes(1);
            expect(callbackUrlSentBy(sent)).toBe(ACCEPTED_CALLBACK_URL);
        });
    });

    it('navigates after a password sign-in only to the checked callbackUrl', async () => {
        withCallbackUrl('//evil.com');
        await AUTH_PATHS[0]?.run();
        expect(navigation.push).toHaveBeenCalledWith(routes.home);
        expect(navigation.push).not.toHaveBeenCalledWith('//evil.com');
    });
});
