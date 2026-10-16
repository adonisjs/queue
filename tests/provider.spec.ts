/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { configProvider } from '@adonisjs/core'
import { Locator } from '@boringnode/queue'
import { sync } from '@boringnode/queue/drivers/sync_adapter'

import { setupApp } from './helpers.js'
import QueueWork from '../commands/queue_work.js'
import { defineConfig } from '../index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

test.group('Provider', (group) => {
  group.each.setup(({ context }) => {
    context.fs.baseUrl = BASE_URL
    context.fs.basePath = fileURLToPath(BASE_URL)

    Locator.clear()
    context.cleanup(() => Locator.clear())
  })

  test('should resolve queue manager from container', async ({ assert }) => {
    const app = await setupApp()

    const queueManager = await app.container.make('queue.manager')

    assert.isDefined(queueManager)
    assert.isFunction(queueManager.use)
    assert.isFunction(queueManager.destroy)
  })

  test('should load jobs when starting outside of console', async ({ assert, cleanup, fs }) => {
    cleanup(() => {
      delete (globalThis as any).__adonisQueueHashWasUndefined
    })

    await fs.create(
      'app/jobs/provider_web_job.ts',
      `
        import { Job } from '@boringnode/queue'
        import hash from '@adonisjs/core/services/hash'

        ;(globalThis as any).__adonisQueueHashWasUndefined = hash === undefined

        export default class ProviderWebJob extends Job {
          async execute() {}
        }
      `
    )

    const app = await setupApp('web', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: sync(),
        },
        locations: [`${fs.basePath}/app/jobs/provider_web_job.ts`],
      }),
    })

    assert.isUndefined(Locator.get('ProviderWebJob'))
    assert.isUndefined((globalThis as any).__adonisQueueHashWasUndefined)

    await app.start(async () => {})

    assert.equal(Locator.get('ProviderWebJob')?.name, 'ProviderWebJob')
    assert.isFalse((globalThis as any).__adonisQueueHashWasUndefined)
  })

  test('should not load jobs automatically in console', async ({ assert, fs }) => {
    await fs.create(
      'app/jobs/provider_console_job.ts',
      `
        import { Job } from '@boringnode/queue'

        export default class ProviderConsoleJob extends Job {
          async execute() {}
        }
      `
    )

    const app = await setupApp('console', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: sync(),
        },
        locations: [`${fs.basePath}/app/jobs/provider_console_job.ts`],
      }),
    })

    assert.isUndefined(Locator.get('ProviderConsoleJob'))

    await app.start(async () => {})

    assert.isUndefined(Locator.get('ProviderConsoleJob'))
  })

  test('should execute sync jobs outside of console', async ({ assert, cleanup, fs }) => {
    ;(globalThis as any).__adonisQueueSyncRuns = 0
    cleanup(() => {
      delete (globalThis as any).__adonisQueueSyncRuns
    })

    await fs.create(
      'app/jobs/provider_sync_job.ts',
      `
        import { Job } from '@boringnode/queue'

        export default class ProviderSyncJob extends Job {
          async execute() {
            globalThis.__adonisQueueSyncRuns++
          }
        }
      `
    )

    const app = await setupApp('web', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: sync(),
        },
        locations: [`${fs.basePath}/app/jobs/provider_sync_job.ts`],
      }),
    })

    await app.start(async () => {})

    const { default: ProviderSyncJob } = await import(
      new URL('app/jobs/provider_sync_job.ts', BASE_URL).href
    )

    await ProviderSyncJob.dispatch({})

    assert.equal((globalThis as any).__adonisQueueSyncRuns, 1)
  })

  test('queue:work should load jobs before starting the worker', async ({ assert }) => {
    const { Worker } = await import('@boringnode/queue')
    const originalStart = Worker.prototype.start
    const order: string[] = []
    const config = defineConfig({
      default: 'sync',
      adapters: {
        sync: sync(),
      },
      locations: ['./app/jobs/*.ts'],
    })

    Worker.prototype.start = async () => {
      order.push('start')
    }

    try {
      await QueueWork.prototype.run.call({
        app: {
          terminating() {},
          config: {
            get() {
              return config
            },
          },
          container: {
            async make(binding: string) {
              if (binding === 'queue.manager') {
                return {
                  async loadJobs() {
                    order.push('loadJobs')
                  },
                }
              }

              if (binding === 'logger') {
                return {}
              }

              if (binding === 'router') {
                return {
                  commit() {
                    order.push('router')
                  },
                }
              }

              throw new Error(`Unexpected binding: ${binding}`)
            },
          },
        },
        logger: {
          info() {},
        },
        async terminate() {
          order.push('terminate')
        },
      })
    } finally {
      Worker.prototype.start = originalStart
    }

    assert.deepEqual(order, ['router', 'loadJobs', 'start', 'terminate'])
  })
  test('queue:work stops the worker before the app terminates', async ({ assert }) => {
    const { Worker } = await import('@boringnode/queue')
    const originalStart = Worker.prototype.start
    let started!: () => void
    const workerStarted = new Promise<void>((resolve) => (started = resolve))

    Worker.prototype.start = function (this: InstanceType<typeof Worker>, queues: string[]) {
      started()
      return originalStart.call(this, queues)
    }

    try {
      const app = await setupApp('console', {
        queue: defineConfig({
          default: 'sync',
          adapters: { sync: sync() },
          worker: { idleDelay: '10ms' },
        }),
      })
      const ace = await app.container.make('ace')
      const command = await ace.create(QueueWork, [])
      const execution = command.exec()

      await workerStarted

      /**
       * What bin/console.ts does on SIGTERM
       */
      await app.terminate()
      await execution

      assert.isUndefined(command.error)
      assert.equal(app.getState(), 'terminated')
    } finally {
      Worker.prototype.start = originalStart
    }
  })

  test('queue:work --all-queues processes every configured queue', async ({ assert }) => {
    const { Worker } = await import('@boringnode/queue')
    const originalStart = Worker.prototype.start
    let processedQueues: string[] = []

    Worker.prototype.start = async (queues: string[]) => {
      processedQueues = queues
    }

    try {
      const app = await setupApp('console', {
        queue: defineConfig({
          default: 'sync',
          adapters: { sync: sync() },
          queues: { emails: {}, reports: { adapter: 'sync' } },
        }),
      })
      const ace = await app.container.make('ace')
      const command = await ace.create(QueueWork, ['--all-queues'])
      await command.exec()

      assert.deepEqual(processedQueues, ['default', 'emails', 'reports'])
    } finally {
      Worker.prototype.start = originalStart
    }
  })
  test('should not resolve the queue manager when warming up the app', async ({ assert, fs }) => {
    await fs.create(
      'app/jobs/provider_warmup_job.ts',
      `
        import { Job } from '@boringnode/queue'

        export default class ProviderWarmupJob extends Job {
          async execute() {}
        }
      `
    )

    /**
     * Adapters like redis acquire their connection when resolved. Resolving
     * them while warming up the app leaves open sockets behind, since the
     * providers of a warmed up app are never shut down
     */
    let resolvedAdapters = 0
    const app = await setupApp(
      'web',
      {
        queue: defineConfig({
          default: 'sync',
          adapters: {
            sync: configProvider.create(async () => {
              resolvedAdapters++
              return sync()
            }),
          },
          locations: [`${fs.basePath}/app/jobs/provider_warmup_job.ts`],
        }),
      },
      'warmup'
    )

    assert.equal(resolvedAdapters, 0)

    await app.warmUp()

    assert.equal(app.getState(), 'warmed')
    assert.equal(resolvedAdapters, 0)
    assert.isUndefined(Locator.get('ProviderWarmupJob'))
  })

  test('should resolve the queue manager when booting the app', async ({ assert }) => {
    let resolvedAdapters = 0
    await setupApp('web', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: configProvider.create(async () => {
            resolvedAdapters++
            return sync()
          }),
        },
      }),
    })

    assert.equal(resolvedAdapters, 1)
  })
})
