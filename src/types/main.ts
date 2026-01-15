/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { ConfigProvider } from '@adonisjs/core/types'
import type { AdapterFactory, QueueManagerConfig } from '@boringnode/queue/types'

export * from '@boringnode/queue/types'

/**
 * AdonisJS-specific queue configuration that supports both
 * direct adapter factories and config providers.
 */
export interface QueueConfig extends Omit<QueueManagerConfig, 'adapters'> {
  adapters: Record<string, AdapterFactory | ConfigProvider<AdapterFactory>>
}
