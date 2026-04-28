/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import type { QueueManager } from '@boringnode/queue'

declare module '@adonisjs/core/types' {
  export interface ContainerBindings {
    'queue.manager': typeof QueueManager & {
      start(): Promise<void>
    }
  }
}
