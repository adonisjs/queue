/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ApplicationService } from '@adonisjs/core/types'

import '../src/types/extended.js'
import { initQueue } from '../src/utils.ts'
import { type QueueConfig } from '../src/types/main.ts'

export default class QueueProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('queue.manager', async () => {
      const { QueueManager } = await import('@boringnode/queue')

      await QueueManager.init({
        ...config,
        autoLoadJobs: false,
        adapters: resolvedAdapters,
        jobFactory,
        logger: config.logger ?? (logger as any),
      })

      return QueueManager as typeof QueueManager & {
        start(): Promise<void>
      }
    })
  }

  async start() {
    if (this.app.getEnvironment() !== 'console') {
      const QueueManager = await this.app.container.make('queue.manager')
      await QueueManager.start()
    }
  }

  async start() {
    if (this.app.getEnvironment() === 'console') {
      return
    }

    const queueManager = await this.app.container.make('queue.manager')
    await queueManager.loadJobs()
  }

  async shutdown() {
    const QueueManager = await this.app.container.make('queue.manager')
    await QueueManager.destroy()
  }
}
