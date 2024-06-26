import { db } from '@nivo/drizzle'
import type { NextAuthConfig, Session } from 'next-auth'
import { GoogleProfile } from 'next-auth/providers/google'

import { credentialsProvider } from './credentials-provider'
import { drizzleAuthAdapter } from './drizzle-auth-adapter'
import { googleProvider } from './google-provider'

export const authConfig = {
  adapter: drizzleAuthAdapter,
  providers: [googleProvider, credentialsProvider],
  pages: {
    signIn: '/auth/sign-in',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        const googleProfile = profile as GoogleProfile
        const [, emailDomain] = googleProfile.email.split('@')

        if (!emailDomain) {
          return false
        }

        const company = await db.query.company.findFirst({
          where(fields, { eq }) {
            return eq(fields.domain, emailDomain)
          },
        })

        return googleProfile.email_verified && !!company
      } else if (account?.provider === 'credentials') {
        return true
      }

      return false
    },
    jwt({ token, user, session, trigger }) {
      if (user) {
        token.companyId = user.companyId
      }

      function isSessionAvailable(session: unknown): session is Session {
        return !!session
      }

      if (trigger === 'update' && isSessionAvailable(session)) {
        token.name = session.user.name
      }

      return token
    },
    session({ session, ...params }) {
      if ('token' in params && session.user) {
        session.user.companyId = params.token.companyId
        session.user.id = params.token.sub!
      }

      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user

      const isOnWebhooks = nextUrl.pathname.startsWith('/api/webhooks')
      const isOnPublicAPIRoutes = nextUrl.pathname.startsWith('/api/auth')
      const isOnAPIRoutes = nextUrl.pathname.startsWith('/api')
      const isOnPrivatePages = nextUrl.pathname.startsWith('/app')
      const isOnPublicPages = !isOnPrivatePages

      if (isOnWebhooks || isOnPublicAPIRoutes) {
        return true
      }

      if (isOnPublicPages && !isOnAPIRoutes && isLoggedIn) {
        return Response.redirect(new URL('/app', nextUrl))
      }

      if (isOnAPIRoutes && !isLoggedIn) {
        return Response.json({ message: 'Unauthorized.' }, { status: 401 })
      }

      if (isOnPrivatePages && !isLoggedIn) {
        return false
      }

      return true
    },
  },
} satisfies NextAuthConfig
