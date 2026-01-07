/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { IgnitorFactory } from '@adonisjs/core/factories'

import { defineConfig, drivers } from '../index.js'
import { resolveAdapters } from '../src/utils.js'
import type { QueueConfig } from '../src/types/main.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

test.group('resolveAdapters', () => {
  test('should resolve config providers to adapter factories', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .merge({
        config: {
          queue: defineConfig({
            default: 'sync',
            adapters: {
              sync: drivers.sync(),
            },
          }),
        },
        rcFileContents: {
          providers: [() => import('../providers/queue_provider.js')],
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

    const app = ignitor.createApp('console')
    await app.init().then(() => app.boot())

    const config = app.config.get<QueueConfig>('queue')

    /**
     * Before resolution, the adapter is a ConfigProvider (object with resolver method)
     */
    assert.isObject(config.adapters.sync)
    assert.isFunction((config.adapters.sync as any).resolver)

    /**
     * After resolution, the adapter should be a factory function
     */
    const resolvedAdapters = await resolveAdapters(config, app)
    assert.isFunction(resolvedAdapters.sync)

    await app.terminate()
  })

  test('should pass through direct factory functions unchanged', async ({ assert }) => {
    const directFactory = () => ({
      pushOn: async () => {},
      pushLaterOn: async () => {},
      pop: async () => null,
      acknowledge: async () => {},
      fail: async () => {},
      getFailedJobs: async () => [],
      removeFailedJob: async () => {},
      clearFailedJobs: async () => {},
      destroy: async () => {},
    })

    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .merge({
        config: {
          queue: defineConfig({
            default: 'custom',
            adapters: {
              custom: directFactory as any,
            },
          }),
        },
        rcFileContents: {
          providers: [() => import('../providers/queue_provider.js')],
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

    const app = ignitor.createApp('console')
    await app.init().then(() => app.boot())

    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    assert.strictEqual(resolvedAdapters.custom, directFactory)

    await app.terminate()
  })

  test('worker should accept resolved adapters without throwing', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .merge({
        config: {
          queue: defineConfig({
            default: 'sync',
            adapters: {
              sync: drivers.sync(),
            },
          }),
        },
        rcFileContents: {
          providers: [() => import('../providers/queue_provider.js')],
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

    const app = ignitor.createApp('console')
    await app.init().then(() => app.boot())

    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    /**
     * Creating a Worker with resolved adapters should not throw
     * "Adapter must be a factory function" error
     */
    const { Worker } = await import('@boringnode/queue')

    assert.doesNotThrow(() => {
      new Worker({
        ...config,
        adapters: resolvedAdapters,
      })
    })

    await app.terminate()
  })
})
