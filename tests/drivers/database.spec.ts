/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'

import { defineConfig, drivers } from '../../index.js'
import { resolveAdapters } from '../../src/utils.js'
import { getDatabaseConfig, setupApp } from '../helpers.js'
import type { QueueConfig } from '../../src/types/main.js'

const databaseProvider = () => import('@adonisjs/lucid/database_provider')

test.group('drivers | database', () => {
  test('do not acquire a connection when resolving the adapter', async ({ assert }) => {
    const app = await setupApp(
      'console',
      {
        database: getDatabaseConfig(),
        queue: defineConfig({
          default: 'database',
          adapters: {
            database: drivers.database({ connectionName: 'jobs' }),
          },
        }),
      },
      [databaseProvider]
    )

    const db = await app.container.make('lucid.db')
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    assert.isFunction(resolvedAdapters.database)
    assert.isFalse(db.manager.isConnected('jobs'))
    assert.isFalse(db.manager.isConnected('main'))
  })

  test('acquire the configured connection when creating the adapter', async ({ assert }) => {
    const app = await setupApp(
      'console',
      {
        database: getDatabaseConfig(),
        queue: defineConfig({
          default: 'database',
          adapters: {
            database: drivers.database({ connectionName: 'jobs' }),
          },
        }),
      },
      [databaseProvider]
    )

    const db = await app.container.make('lucid.db')
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    resolvedAdapters.database()
    assert.isTrue(db.manager.isConnected('jobs'))
    assert.isFalse(db.manager.isConnected('main'))
  })

  test('use the primary connection when no connection name is configured', async ({ assert }) => {
    const app = await setupApp(
      'console',
      {
        database: getDatabaseConfig(),
        queue: defineConfig({
          default: 'database',
          adapters: {
            database: drivers.database(),
          },
        }),
      },
      [databaseProvider]
    )

    const db = await app.container.make('lucid.db')
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    resolvedAdapters.database()
    assert.isTrue(db.manager.isConnected('main'))
    assert.isFalse(db.manager.isConnected('jobs'))
  })

  test('do not acquire a connection when the app starts', async ({ assert }) => {
    const app = await setupApp(
      'web',
      {
        database: getDatabaseConfig(),
        queue: defineConfig({
          default: 'database',
          adapters: {
            database: drivers.database(),
          },
        }),
      },
      [databaseProvider]
    )

    /**
     * Starting the app in the "web" environment initializes the queue
     * manager from the provider's start hook. Doing so must not open any
     * connection, since nothing releases them in a process that never
     * becomes ready (for example, the "codegen" command)
     */
    await app.start(() => {})

    const db = await app.container.make('lucid.db')
    assert.isFalse(db.manager.isConnected('main'))
    assert.isFalse(db.manager.isConnected('jobs'))
  })
})
