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
import { getRedisConfig, setupApp } from '../helpers.js'
import type { QueueConfig } from '../../src/types/main.js'

const redisProvider = () => import('@adonisjs/redis/redis_provider')

test.group('drivers | redis', () => {
  test('do not acquire a connection when resolving the adapter', async ({ assert }) => {
    const app = await setupApp(
      'console',
      {
        redis: getRedisConfig(),
        queue: defineConfig({
          default: 'redis',
          adapters: {
            redis: drivers.redis({ connectionName: 'jobs' as any }),
          },
        }),
      },
      [redisProvider]
    )

    const redis = await app.container.make('redis')
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    assert.isFunction(resolvedAdapters.redis)
    assert.equal(redis.activeConnectionsCount, 0)
  })

  test('acquire the configured connection when creating the adapter', async ({ assert }) => {
    const app = await setupApp(
      'console',
      {
        redis: getRedisConfig(),
        queue: defineConfig({
          default: 'redis',
          adapters: {
            redis: drivers.redis({ connectionName: 'jobs' as any }),
          },
        }),
      },
      [redisProvider]
    )

    const redis = await app.container.make('redis')
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    resolvedAdapters.redis()
    assert.equal(redis.activeConnectionsCount, 1)
    assert.property(redis.activeConnections, 'jobs')
  })

  test('use the default connection when no connection name is configured', async ({ assert }) => {
    const app = await setupApp(
      'console',
      {
        redis: getRedisConfig(),
        queue: defineConfig({
          default: 'redis',
          adapters: {
            redis: drivers.redis(),
          },
        }),
      },
      [redisProvider]
    )

    const redis = await app.container.make('redis')
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    resolvedAdapters.redis()
    assert.property(redis.activeConnections, 'main')
  })

  test('do not acquire a connection when the app starts', async ({ assert }) => {
    const app = await setupApp(
      'web',
      {
        redis: getRedisConfig(),
        queue: defineConfig({
          default: 'redis',
          adapters: {
            redis: drivers.redis(),
          },
        }),
      },
      [redisProvider]
    )

    /**
     * Starting the app in the "web" environment initializes the queue
     * manager from the provider's start hook. Doing so must not open any
     * connection, since nothing releases them in a process that never
     * becomes ready (for example, the "codegen" command)
     */
    await app.start(() => {})

    const redis = await app.container.make('redis')
    assert.equal(redis.activeConnectionsCount, 0)
  })
})
