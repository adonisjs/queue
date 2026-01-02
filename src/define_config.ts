/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { QueueManagerConfig } from '@boringnode/queue/types'

/**
 * Define queue configuration with type-safety.
 */
export function defineConfig(config: QueueManagerConfig): QueueManagerConfig {
  return config
}
