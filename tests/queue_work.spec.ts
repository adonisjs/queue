/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { ListLoader } from '@adonisjs/core/ace'

import { setupApp } from './helpers.js'
import QueueWork from '../commands/queue_work.js'
import { defineConfig, drivers } from '../index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

/**
 * Runs queue:work as the main command of the Ace kernel, the way
 * `node ace queue:work` runs it, so that the command can terminate the app.
 */
async function runQueueWork(app: Awaited<ReturnType<typeof setupApp>>) {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  ace.addLoader(new ListLoader([QueueWork]))
  await ace.handle(['queue:work'])
  return ace
}

test.group('queue:work', (group) => {
  group.each.setup(({ context }) => {
    context.fs.baseUrl = BASE_URL
    context.fs.basePath = fileURLToPath(BASE_URL)
  })

  test('exits with code 1 when the router cannot commit its routes', async ({ assert }) => {
    const app = await setupApp('console')

    const router = await app.container.make('router')
    router.get('/a', () => {}).as('home')
    router.get('/b', () => {}).as('home')

    const ace = await runQueueWork(app)
    const command = ace.getMainCommand()!

    assert.equal(command.exitCode, 1)
    assert.equal(ace.exitCode, 1)
    assert.equal(app.getState(), 'terminated')
  })

  test('exits with code 1 when the worker cannot start', async ({ assert }) => {
    const app = await setupApp('console', {
      queue: defineConfig({
        default: 'sync',
        adapters: { sync: drivers.sync() },
        worker: { unknownJobRetries: -1 },
      }),
    })

    const ace = await runQueueWork(app)
    const command = ace.getMainCommand()!

    assert.equal(command.exitCode, 1)
    assert.equal(ace.exitCode, 1)
    assert.equal(app.getState(), 'terminated')
  })
})
