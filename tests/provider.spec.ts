/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { setupApp } from './helpers.js'

test.group('Provider', () => {
  test('should resolve queue manager from container', async ({ assert }) => {
    const app = await setupApp()

    const queueManager = await app.container.make('queue.manager')

    assert.isDefined(queueManager)
    assert.isFunction(queueManager.use)
    assert.isFunction(queueManager.destroy)
  })
})
