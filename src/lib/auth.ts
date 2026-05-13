import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type { NextAuthConfig } from 'next-auth';
import NextAuth from 'next-auth';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Email from 'next-auth/providers/nodemailer';

import { env } from '~/env';
import { sendMagicLinkEmail } from '~/lib/email';
import { credentialsSchema } from '~/lib/schemas/session';
import { accounts, db, sessions, users, verificationTokens } from '~/server/db';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

async function readRequestMetadata(): Promise<{
    userAgent: string | null;
    ipAddress: string | null;
}> {
    try {
        const h = await headers();
        const userAgent = h.get('user-agent');
        const ipAddress =
            h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            h.get('x-real-ip') ??
            null;
        return { userAgent, ipAddress };
    } catch {
        return { userAgent: null, ipAddress: null };
    }
}

function deriveNameFromEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const local = email.split('@')[0]?.trim();
    if (!local) return null;
    return local.slice(0, 256);
}

function buildAdapter(): Adapter {
    const base = DrizzleAdapter(db, {
        usersTable: users,
        accountsTable: accounts,
        sessionsTable: sessions,
        verificationTokensTable: verificationTokens,
    });
    const lower = (e: string | null | undefined) =>
        e ? e.toLowerCase() : (e ?? null);
    return {
        ...base,
        async createUser(user) {
            const email = lower(user.email);
            const name = user.name ?? deriveNameFromEmail(email);
            return base.createUser!({ ...user, email, name } as AdapterUser);
        },
        async getUserByEmail(email) {
            return base.getUserByEmail!(email.toLowerCase());
        },
        async updateUser(user) {
            const next = { ...user };
            if (typeof next.email === 'string')
                next.email = next.email.toLowerCase();
            return base.updateUser!(next);
        },
    };
}

const providers: NextAuthConfig['providers'] = [
    Credentials({
        credentials: {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
        },
        async authorize(raw) {
            const parsed = credentialsSchema.safeParse(raw);
            if (!parsed.success) return null;
            const { email, password } = parsed.data;

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (!user?.password || !user.email) return null;

            const valid = await compare(password, user.password);
            if (!valid) return null;

            return {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            };
        },
    }),
    Email({
        from: 'noreply@sadra.nl',
        server: { host: 'unused', port: 0, auth: { user: '', pass: '' } },
        sendVerificationRequest: async (params: {
            identifier: string;
            url: string;
        }) => {
            await sendMagicLinkEmail(params.identifier, params.url);
        },
    }),
];

const googleId: string | undefined = env.AUTH_GOOGLE_ID;
const googleSecret: string | undefined = env.AUTH_GOOGLE_SECRET;
if (googleId && googleSecret) {
    providers.push(
        Google({
            clientId: googleId,
            clientSecret: googleSecret,
            allowDangerousEmailAccountLinking: true,
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
            allowDangerousEmailAccountLinking: true,
        }),
    );
}

export const { auth, signIn, signOut, handlers } = NextAuth({
    trustHost: true,
    adapter: buildAdapter(),
    session: {
        strategy: 'jwt',
        maxAge: SESSION_TTL_MS / 1000,
        updateAge: SESSION_UPDATE_INTERVAL_MS / 1000,
    },
    providers,
    callbacks: {
        async jwt({ token, user, account }) {
            if (user?.id && account) {
                const meta = await readRequestMetadata();
                const sessionToken = crypto.randomUUID();
                const expires = new Date(Date.now() + SESSION_TTL_MS);
                await db.insert(sessions).values({
                    sessionToken,
                    userId: user.id,
                    expires,
                    userAgent: meta.userAgent,
                    ipAddress: meta.ipAddress,
                });
                token.sessionToken = sessionToken;
                token.userId = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            const userId = token?.userId;
            if (typeof userId !== 'string') return session;

            const [row] = await db
                .select({
                    name: users.name,
                    email: users.email,
                    image: users.image,
                })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            session.user.id = userId;
            session.user.name = row?.name ?? null;
            session.user.email = row?.email ?? '';
            session.user.image = row?.image ?? null;
            return session;
        },
    },
    jwt: {
        encode: async ({ token }) => {
            return (token?.sessionToken as string | undefined) ?? '';
        },
        decode: async ({ token }) => {
            if (!token) return null;
            const [row] = await db
                .select({
                    userId: sessions.userId,
                    expires: sessions.expires,
                    lastUsedAt: sessions.lastUsedAt,
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
                        lastUsedAt: new Date(now),
                        expires: new Date(now + SESSION_TTL_MS),
                    })
                    .where(eq(sessions.sessionToken, token));
            }

            return {
                sessionToken: token,
                userId: row.userId,
            };
        },
    },
    events: {
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
    pages: {
        signIn: '/login',
        error: '/auth-error',
        verifyRequest: '/verify-request',
    },
});
