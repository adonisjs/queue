/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import '../src/types/extended.js'
import { resolveAdapters, resolveHotReload, resolveJobFactory } from '../src/utils.js'
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
        autoLoadJobs: false,
        adapters: resolvedAdapters,
        jobFactory,
        hotReload: resolveHotReload(config),
        logger: config.logger ?? (logger as any),
      })

      return QueueManager
    })
  }

  /**
   * A warmed up app never gets started and its providers are never shut
   * down. Therefore, we must not resolve the queue manager (and open the
   * adapter connections) in this mode. The "getMode" method is missing in
   * the older versions of the framework core without the "warmup" mode.
   */
  #isWarmingUp() {
    return this.app.getMode?.() === 'warmup'
  }

  async boot() {
    if (this.#isWarmingUp()) {
      return
    }

    await this.app.container.make('queue.manager')
  }

  async start() {
    if (this.app.getEnvironment() === 'console' || this.#isWarmingUp()) {
      return
    }

    const queueManager = await this.app.container.make('queue.manager')
    await queueManager.loadJobs()
  }

  async shutdown() {
    const queueManager = await this.app.container.make('queue.manager')
    await queueManager.destroy()
  }
}
