/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import '../src/types/extended.js'
import type { ApplicationService } from '@adonisjs/core/types'
import type { QueueManagerConfig } from '@boringnode/queue/types'

export default class QueueProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton('queue.manager', async () => {
      const { QueueManager } = await import('@boringnode/queue')
      const config = this.app.config.get<QueueManagerConfig>('queue')

      /**
       * Resolve adapter factories from config providers
       */
      const resolvedAdapters: Record<string, () => any> = {}

      for (const [name, adapterConfig] of Object.entries(config.adapters)) {
        if (typeof adapterConfig === 'function') {
          resolvedAdapters[name] = adapterConfig
        } else {
          resolvedAdapters[name] = await (adapterConfig as any).resolver(this.app)
        }
      }

      /**
       * Inject jobFactory if not already defined.
       * This enables automatic dependency injection for job classes.
       */
      const jobFactory =
        config.jobFactory ??
        (async (JobClass) => {
          return this.app.container.make(JobClass)
        })

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

  async shutdown() {
    const queueManager = await this.app.container.make('queue.manager')
    await queueManager.destroy()
  }
}
