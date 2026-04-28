/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { type Logger } from '@adonisjs/core/logger'
import type { ApplicationService } from '@adonisjs/core/types'
import type { QueueManager as QueueManagerSingleton } from '@boringnode/queue'
import type { AdapterFactory, JobFactory, QueueConfig } from './types/main.js'

/**
 * Resolve adapter factories from config providers.
 *
 * Adapters in the config can be either:
 * - Direct factory functions
 * - ConfigProvider objects that need to be resolved
 *
 * This function normalizes them all to factory functions.
 */
export async function resolveAdapters(
  config: QueueConfig,
  app: ApplicationService
): Promise<Record<string, AdapterFactory>> {
  const resolvedAdapters: Record<string, AdapterFactory> = {}

  for (const [name, adapterConfig] of Object.entries(config.adapters)) {
    if (typeof adapterConfig === 'function') {
      resolvedAdapters[name] = adapterConfig as AdapterFactory
    } else {
      resolvedAdapters[name] = await adapterConfig.resolver(app)
    }
  }

  return resolvedAdapters
}

export function resolveJobFactory(config: QueueConfig, app: ApplicationService): JobFactory {
  return config.jobFactory ?? ((jobClass: any) => app.container.make(jobClass))
}

export async function initQueue(
  manager: typeof QueueManagerSingleton,
  app: ApplicationService,
  config: QueueConfig,
  logger: Logger
) {
  const resolvedAdapters = await resolveAdapters(config, app)
  const jobFactory = resolveJobFactory(config, app)

  await manager.init({
    ...config,
    adapters: resolvedAdapters,
    jobFactory,
    logger: config.logger ?? logger,
  })
}
