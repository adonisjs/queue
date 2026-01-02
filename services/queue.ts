/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import app from '@adonisjs/core/services/app'
import type { QueueManager } from '@boringnode/queue'

let queue: typeof QueueManager

await app.booted(async () => {
  queue = await app.container.make('queue.manager')
})

export { queue as default }
