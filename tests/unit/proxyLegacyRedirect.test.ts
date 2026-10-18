import { describe, expect, it } from 'vitest';

import { proxyRedirect } from '~/proxy';

const TEMPORARY_REDIRECT = 307;

describe('proxyRedirect: legacy calculator query links', () => {
    it('sends /prop-calculator?firm=... to the simulator with a 307', () => {
        expect(
            proxyRedirect('/prop-calculator', '?firm=apex&plan=eod', false),
        ).toEqual({
            location: '/prop-calculator/simulator?firm=apex&plan=eod',
            status: TEMPORARY_REDIRECT,
        });
    });

    it('keeps the raw query byte for byte', () => {
        const search = '?wr=0.4&firm=mffu&pf=a%2Cb%3Ac&x=a+b&x=%20&empty=';
        expect(proxyRedirect('/prop-calculator', search, true)).toEqual({
            location: `/prop-calculator/simulator${search}`,
            status: TEMPORARY_REDIRECT,
        });
    });

    it('passes a hub request without a firm, or a tool page request, through', () => {
        expect(proxyRedirect('/prop-calculator', '', false)).toBeNull();
        expect(proxyRedirect('/prop-calculator', '?wr=0.4', false)).toBeNull();
        expect(
            proxyRedirect('/prop-calculator/simulator', '?firm=apex', false),
        ).toBeNull();
        expect(
            proxyRedirect('/prop-calculator/analysis', '?firm=apex', false),
        ).toBeNull();
        expect(proxyRedirect('/', '?firm=apex', false)).toBeNull();
    });
});

describe('proxyRedirect: private areas', () => {
    it('still sends a signed-out visitor of a private path to the login page', () => {
        expect(
            proxyRedirect('/prop-calculator/accounts', '?firm=apex', false),
        ).toEqual({
            location:
                '/login?callbackUrl=%2Fprop-calculator%2Faccounts%3Ffirm%3Dapex',
            status: TEMPORARY_REDIRECT,
        });
        expect(proxyRedirect('/profile', '', false)).toEqual({
            location: '/login?callbackUrl=%2Fprofile',
            status: TEMPORARY_REDIRECT,
        });
    });

    it('lets a signed-in visitor through to a private path', () => {
        expect(
            proxyRedirect('/prop-calculator/accounts', '?firm=apex', true),
        ).toBeNull();
        expect(proxyRedirect('/profile', '', true)).toBeNull();
    });

    it('passes a public path through without a session', () => {
        expect(proxyRedirect('/contact', '', false)).toBeNull();
    });
});
