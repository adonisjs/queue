/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getActiveTest } from '@japa/runner'
import { IgnitorFactory } from '@adonisjs/core/factories'
import type { AppEnvironments, ApplicationModes } from '@adonisjs/core/types/app'

import { defineConfig as defineRedisConfig } from '@adonisjs/redis'
import { defineConfig as defineDatabaseConfig } from '@adonisjs/lucid'

import { defineConfig, drivers } from '../index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

/**
 * Returns the redis config with "main" and "jobs" connections pointing to
 * the redis server from the environment
 */
export function getRedisConfig() {
  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  }

  return defineRedisConfig({
    connection: 'main',
    connections: {
      main: { ...connection },
      jobs: { ...connection },
    },
  })
}

/**
 * Returns the database config with "main" and "jobs" in-memory sqlite
 * connections, so the tests can open a real connection without any
 * external database server
 */
export function getDatabaseConfig() {
  const connection = {
    client: 'better-sqlite3' as const,
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  }

  return defineDatabaseConfig({
    connection: 'main',
    connections: {
      main: { ...connection },
      jobs: { ...connection },
    },
  })
}

export async function setupApp(
  env?: AppEnvironments,
  config: {
    queue?: ReturnType<typeof defineConfig>
    [key: string]: unknown
  } = {},
  providers: (() => Promise<{ default: any }>)[] = [],
  mode?: ApplicationModes
) {
  const ignitor = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .merge({
      config: {
        ...config,
        queue:
          config.queue ||
          defineConfig({
            default: 'sync',
            adapters: {
              sync: drivers.sync(),
            },
          }),
      },
      rcFileContents: {
        providers: [() => import('../providers/queue_provider.js'), ...providers],
      },
    })
    .create(BASE_URL, {
      importer: (filePath) => {
        if (filePath.startsWith('./') || filePath.startsWith('../')) {
          return import(new URL(filePath, BASE_URL).href)
        }

        return import(filePath)
      },
    })

  const app = ignitor.createApp(env || 'web')
  if (mode) {
    app.setMode(mode)
  }

  await app.init().then(() => app.boot())

  getActiveTest()?.cleanup(() => app.terminate())

  return app
}
