import type { NextAuthConfig } from 'next-auth';
import type { Adapter, AdapterUser } from 'next-auth/adapters';

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Email from 'next-auth/providers/nodemailer';
import { headers } from 'next/headers';

import { env } from '~/env';
import { resolveRole, ROOT_EMAIL } from '~/lib/auth-roles';
import { sendMagicLinkEmail, sendSignUpNotification } from '~/lib/email';
import { checkRateLimit, resetRateLimit } from '~/lib/rate-limit';
import { routes } from '~/lib/routes';
import { credentialsSchema } from '~/lib/schemas/session';
import { accounts, db, sessions, users, verificationTokens } from '~/server/db';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

const lower = (e: null | string | undefined) =>
    e ? e.toLowerCase() : (e ?? null);

function buildAdapter(): Adapter {
    const base = DrizzleAdapter(db, {
        accountsTable: accounts,
        sessionsTable: sessions,
        usersTable: users,
        verificationTokensTable: verificationTokens,
    }) as Required<Adapter>;
    return {
        ...base,
        async createUser(user) {
            const email = lower(user.email);
            const name = user.name ?? deriveNameFromEmail(email);
            return base.createUser({ ...user, email, name } as AdapterUser);
        },
        async getUserByEmail(email) {
            return base.getUserByEmail(email.toLowerCase());
        },
        async updateUser(user) {
            const next = { ...user };
            if (typeof next.email === 'string')
                next.email = next.email.toLowerCase();
            return base.updateUser(next);
        },
    };
}

function deriveNameFromEmail(email: null | string | undefined): null | string {
    if (!email) return null;
    const local = email.split('@')[0]?.trim();
    if (!local) return null;
    return local.slice(0, 256);
}

async function readRequestMetadata(): Promise<{
    ipAddress: null | string;
    userAgent: null | string;
}> {
    try {
        const h = await headers();
        const userAgent = h.get('user-agent');
        const ipAddress =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            h.get('x-real-ip') ??
            null;
        return { ipAddress, userAgent };
    } catch {
        return { ipAddress: null, userAgent: null };
    }
}

const providers: NextAuthConfig['providers'] = [
    Credentials({
        async authorize(raw) {
            const parsed = credentialsSchema.safeParse(raw);
            if (!parsed.success) return null;
            const { email, password } = parsed.data;

            const meta = await readRequestMetadata();
            const rlEmailOk = await checkRateLimit({
                bucket: 'login:email',
                key: email,
                max: 10,
                windowMs: 15 * 60 * 1000,
            });
            const rlIpOk = await checkRateLimit({
                bucket: 'login:ip',
                key: meta.ipAddress ?? 'unknown',
                max: 30,
                windowMs: 15 * 60 * 1000,
            });
            if (!rlEmailOk || !rlIpOk) return null;

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (!user?.password || !user.email) return null;

            const valid = await compare(password, user.password);
            if (!valid) return null;

            if (!user.emailVerified) return null;

            resetRateLimit({ bucket: 'login:email', key: email });
            return {
                email: user.email,
                id: user.id,
                image: user.image,
                name: user.name,
            };
        },
        credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
        },
    }),
    Email({
        from: 'noreply@sadra.nl',
        sendVerificationRequest: async (params: {
            identifier: string;
            url: string;
        }) => {
            await sendMagicLinkEmail(params.identifier, params.url);
        },
        server: { auth: { pass: '', user: '' }, host: 'unused', port: 0 },
    }),
];

const googleId: string | undefined = env.AUTH_GOOGLE_ID;
const googleSecret: string | undefined = env.AUTH_GOOGLE_SECRET;
if (googleId && googleSecret) {
    providers.push(
        Google({
            clientId: googleId,
            clientSecret: googleSecret,
        }),
    );
}

const githubId: string | undefined = env.AUTH_GITHUB_ID;
const githubSecret: string | undefined = env.AUTH_GITHUB_SECRET;
if (githubId && githubSecret) {
    providers.push(
        GitHub({
            clientId: githubId,
            clientSecret: githubSecret,
        }),
    );
}

export const { auth, handlers, signIn, signOut } = NextAuth({
    adapter: buildAdapter(),
    callbacks: {
        async jwt({ account, token, user }) {
            if (account && typeof user.id === 'string') {
                const meta = await readRequestMetadata();
                const sessionToken = crypto.randomUUID();
                const expires = new Date(Date.now() + SESSION_TTL_MS);
                await db.insert(sessions).values({
                    expires,
                    ipAddress: meta.ipAddress,
                    sessionToken,
                    userAgent: meta.userAgent,
                    userId: user.id,
                });
                token.sessionToken = sessionToken;
                token.userId = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            const userId = token.userId;
            if (typeof userId !== 'string') return session;

            const [row] = await db
                .select({
                    email: users.email,
                    image: users.image,
                    name: users.name,
                    role: users.role,
                })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            session.user.id = userId;
            session.user.name = row?.name ?? null;
            session.user.email = row?.email ?? '';
            session.user.image = row?.image ?? null;
            session.user.role = resolveRole(row?.email, row?.role);
            return session;
        },
    },
    events: {
        async createUser({ user }) {
            if (
                user.email?.toLowerCase() === ROOT_EMAIL &&
                typeof user.id === 'string'
            ) {
                await db
                    .update(users)
                    .set({ role: 'root' })
                    .where(eq(users.id, user.id));
            }
            sendSignUpNotification(user.email ?? '', user.name).catch(
                (error: unknown) =>
                    console.error('[auth] sign-up notification failed', error),
            );
        },
        async signOut(message) {
            const token =
                'token' in message && message.token
                    ? (message.token.sessionToken as string | undefined)
                    : undefined;
            if (token) {
                await db
                    .delete(sessions)
                    .where(eq(sessions.sessionToken, token));
            }
        },
    },
    jwt: {
        decode: async ({ token }) => {
            if (!token) return null;
            const [row] = await db
                .select({
                    expires: sessions.expires,
                    lastUsedAt: sessions.lastUsedAt,
                    userId: sessions.userId,
                })
                .from(sessions)
                .where(eq(sessions.sessionToken, token))
                .limit(1);
            if (!row || row.expires < new Date()) return null;

            const now = Date.now();
            if (now - row.lastUsedAt.getTime() >= SESSION_UPDATE_INTERVAL_MS) {
                await db
                    .update(sessions)
                    .set({
                        expires: new Date(now + SESSION_TTL_MS),
                        lastUsedAt: new Date(now),
                    })
                    .where(eq(sessions.sessionToken, token));
            }

            return {
                sessionToken: token,
                userId: row.userId,
            };
        },
        encode: async ({ token }) => {
            return (token?.sessionToken as string | undefined) ?? '';
        },
    },
    pages: {
        error: routes.auth.error,
        signIn: routes.auth.login,
        verifyRequest: routes.auth.verifyRequest,
    },
    providers,
    session: {
        maxAge: SESSION_TTL_MS / 1000,
        strategy: 'jwt',
        updateAge: SESSION_UPDATE_INTERVAL_MS / 1000,
    },
    trustHost: true,
});
