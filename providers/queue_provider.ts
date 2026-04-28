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

      ;(QueueManager as any)['start'] = async () => {
        const config = this.app.config.get<QueueConfig>('queue')
        const logger = await this.app.container.make('logger')
        return initQueue(QueueManager, this.app, config, logger)
      }

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

  async shutdown() {
    const QueueManager = await this.app.container.make('queue.manager')
    await QueueManager.destroy()
  }
}
