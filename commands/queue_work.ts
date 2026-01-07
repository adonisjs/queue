/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { flags, BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { QueueConfig } from '../src/types/main.js'

export default class QueueWork extends BaseCommand {
  static commandName = 'queue:work'
  static description = 'Start processing jobs from the queue'

  static options: CommandOptions = {
    startApp: true,
    staysAlive: true,
  }

  @flags.string({ description: 'Comma-separated list of queues to process', alias: 'q' })
  declare queue?: string

  @flags.number({ description: 'Number of jobs to process concurrently', alias: 'c' })
  declare concurrency?: number

  async run() {
    const { Worker } = await import('@boringnode/queue')
    const config = this.app.config.get<QueueConfig>('queue')

    /**
     * Commit the router to ensure all routes are registered.
     * This is required when jobs dispatch HTTP requests or
     * use URL generation.
     */
    const router = await this.app.container.make('router')
    router.commit()

    /**
     * Resolve adapter factories from config providers
     */
    const resolvedAdapters: Record<string, () => any> = {}

    for (const [name, adapterConfig] of Object.entries(config.adapters)) {
      if (typeof adapterConfig === 'function') {
        resolvedAdapters[name] = adapterConfig as () => any
      } else {
        resolvedAdapters[name] = await adapterConfig.resolver(this.app)
      }
    }

    const queues = this.queue ? this.queue.split(',').map((q) => q.trim()) : ['default']

    this.logger.info(`Starting worker for queues: ${queues.join(', ')}`)

    const worker = new Worker({
      ...config,
      adapters: resolvedAdapters,
      ...(this.concurrency && { concurrency: this.concurrency }),
    })
    await worker.start(queues)
  }
}
