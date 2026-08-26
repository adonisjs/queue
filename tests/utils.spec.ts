/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { test } from '@japa/runner'
import { IgnitorFactory } from '@adonisjs/core/factories'
import type { Kysely } from 'kysely'

import { defineConfig, drivers } from '../index.js'
import { resolveAdapters } from '../src/utils.js'
import type { QueueConfig } from '../src/types/main.js'

const BASE_URL = new URL('./tmp/', import.meta.url)
const execFileAsync = promisify(execFile)

test.group('resolveAdapters', () => {
  test('Kysely driver should resolve when Lucid cannot be imported', async ({ assert }) => {
    const script = `
      import { registerHooks } from 'node:module'

      registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === '@adonisjs/lucid' || specifier.startsWith('@adonisjs/lucid/')) {
            throw new Error('Lucid must not be resolved')
          }
          return nextResolve(specifier, context)
        },
      })

      const { drivers } = await import('./src/drivers.ts')
      const provider = drivers.kysely({}, { dialect: 'sqlite' })
      const factory = await provider.resolver({})
      const adapter = factory()

      if (adapter.constructor.name !== 'KyselyAdapter') {
        throw new Error('Kysely adapter did not resolve')
      }
    `

    const result = await execFileAsync(
      process.execPath,
      ['--import=@poppinss/ts-exec', '--input-type=module', '--eval', script],
      { cwd: new URL('..', import.meta.url) }
    )

    assert.equal(result.stderr, '')
  })

  test('Kysely driver should resolve without a Lucid binding', async ({ assert }) => {
    const connection = {} as Kysely<object>
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .merge({
        config: {
          queue: defineConfig({
            default: 'database',
            adapters: {
              database: drivers.kysely(connection, { dialect: 'sqlite' }),
            },
          }),
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

    assert.isFalse(app.container.hasBinding('lucid.db'))
    const config = app.config.get<QueueConfig>('queue')
    const resolvedAdapters = await resolveAdapters(config, app)

    assert.isFunction(resolvedAdapters.database)
    assert.equal(resolvedAdapters.database().constructor.name, 'KyselyAdapter')

    await app.terminate()
  })

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
