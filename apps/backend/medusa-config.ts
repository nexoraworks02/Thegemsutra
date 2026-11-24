import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Development email folder. The isolated M2 test environment sets OUTBOX_DIR=.outbox-m2test;
// only ".outbox" or ".outbox-<name>" is accepted.
const outboxDir = /^\.outbox(-[a-z0-9]+)?$/.test(process.env.OUTBOX_DIR ?? "") ? process.env.OUTBOX_DIR! : ".outbox"

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      // Personalisable designs (options + prices), edited in the admin "Designs" page.
      resolve: "./src/modules/design",
    },
    {
      // Customer emails. In development they are saved as HTML files in .outbox/
      // (swap the provider for Resend/SendGrid in production).
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/outbox-notification",
            id: "outbox",
            options: { channels: ["email"], dir: outboxDir },
          },
        ],
      },
    },
  ],
})
