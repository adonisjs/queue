/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import '../src/types/extended.js'
import { resolveAdapters, resolveJobFactory } from '../src/utils.js'
import type { ApplicationService } from '@adonisjs/core/types'
import type { QueueConfig } from '../src/types/main.js'

export default class QueueProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('queue.manager', async () => {
      const { QueueManager } = await import('@boringnode/queue')
      const config = this.app.config.get<QueueConfig>('queue')

      const resolvedAdapters = await resolveAdapters(config, this.app)

      /**
       * Inject jobFactory if not already defined.
       * This enables automatic dependency injection for job classes.
       */
      const jobFactory = resolveJobFactory(config, this.app)

      const logger = await this.app.container.make('logger')

      await QueueManager.init({
        ...config,
        adapters: resolvedAdapters,
        jobFactory,
        logger: config.logger ?? (logger as any),
      })

      return QueueManager
    })
  }

  async boot() {
    await this.app.container.make('queue.manager')
  }

  async shutdown() {
    const queueManager = await this.app.container.make('queue.manager')
    await queueManager.destroy()
  }
}
