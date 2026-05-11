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

  test('should load jobs when booting outside of console', async ({ assert, fs }) => {
    await fs.create(
      'app/jobs/provider_web_job.ts',
      `
        import { Job } from '@boringnode/queue'

        export default class ProviderWebJob extends Job {
          async execute() {}
        }
      `
    )

    await setupApp('web', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: sync(),
        },
        locations: [`${fs.basePath}/app/jobs/provider_web_job.ts`],
      }),
    })

    assert.equal(Locator.get('ProviderWebJob')?.name, 'ProviderWebJob')
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

    await setupApp('console', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: sync(),
        },
        locations: [`${fs.basePath}/app/jobs/provider_console_job.ts`],
      }),
    })

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

    await setupApp('web', {
      queue: defineConfig({
        default: 'sync',
        adapters: {
          sync: sync(),
        },
        locations: [`${fs.basePath}/app/jobs/provider_sync_job.ts`],
      }),
    })

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
                  async destroy() {
                    order.push('destroy')
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
      })
    } finally {
      Worker.prototype.start = originalStart
    }

    assert.deepEqual(order, ['router', 'loadJobs', 'start', 'destroy'])
  })
})
