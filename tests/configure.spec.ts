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
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { IgnitorFactory } from '@adonisjs/core/factories'
import Configure from '@adonisjs/core/commands/configure'

const BASE_URL = new URL('./tmp/', import.meta.url)
const BASE_PATH = fileURLToPath(BASE_URL)

test.group('Configure', (group) => {
  group.tap((t) => t.timeout(10_000))

  group.each.setup(async ({ context }) => {
    context.fs.baseUrl = BASE_URL
    context.fs.basePath = fileURLToPath(BASE_URL)

    await context.fs.create('.env', '')
    await context.fs.createJson('tsconfig.json', {})
    await context.fs.create('start/env.ts', `export default Env.create(new URL('./'), {})`)
    await context.fs.create('adonisrc.ts', `export default defineConfig({})`)
    await context.fs.create('database/migrations/.gitkeep', '')
  })

  test('should register provider and command', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }

          return import(filePath)
        },
      })

    const app = ignitor.createApp('web')
    await app.init().then(() => app.boot())

    const ace = await app.container.make('ace')
    ace.prompt.trap('Select the queue driver you plan to use').chooseOption(0)
    ace.ui.switchMode('raw')

    const command = await ace.create(Configure, ['../../index.js'])
    await command.exec()

    await assert.fileExists('adonisrc.ts')
    await assert.fileContains('adonisrc.ts', '@adonisjs/queue/queue_provider')
    await assert.fileContains('adonisrc.ts', '@adonisjs/queue/commands')
  })

  test('should create configuration file', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }

          return import(filePath)
        },
      })

    const app = ignitor.createApp('web')
    await app.init().then(() => app.boot())

    const ace = await app.container.make('ace')
    ace.prompt.trap('Select the queue driver you plan to use').chooseOption(0)
    ace.ui.switchMode('raw')

    const command = await ace.create(Configure, ['../../index.js'])
    await command.exec()

    await assert.fileExists('config/queue.ts')
    await assert.fileContains('config/queue.ts', 'defineConfig')
  })

  test('should add environment variables', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }

          return import(filePath)
        },
      })

    const app = ignitor.createApp('web')
    await app.init().then(() => app.boot())

    const ace = await app.container.make('ace')
    ace.prompt.trap('Select the queue driver you plan to use').chooseOption(0)
    ace.ui.switchMode('raw')

    const command = await ace.create(Configure, ['../../index.js'])
    await command.exec()

    await assert.fileContains('.env', 'QUEUE_DRIVER')
    await assert.fileContains('start/env.ts', 'QUEUE_DRIVER')
  })

  test('should create redis config when redis driver selected', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }

          return import(filePath)
        },
      })

    const app = ignitor.createApp('web')
    await app.init().then(() => app.boot())

    const ace = await app.container.make('ace')
    ace.prompt.trap('Select the queue driver you plan to use').chooseOption(0) // redis
    ace.ui.switchMode('raw')

    const command = await ace.create(Configure, ['../../index.js'])
    await command.exec()

    await assert.fileContains('config/queue.ts', 'drivers.redis')
    await assert.fileContains('.env', 'QUEUE_DRIVER=redis')
  })

  test('should create database config when database driver selected', async ({ assert }) => {
    const ignitor = new IgnitorFactory()
      .withCoreProviders()
      .withCoreConfig()
      .create(BASE_URL, {
        importer: (filePath) => {
          if (filePath.startsWith('./') || filePath.startsWith('../')) {
            return import(new URL(filePath, BASE_URL).href)
          }

          return import(filePath)
        },
      })

    const app = ignitor.createApp('web')
    await app.init().then(() => app.boot())

    const ace = await app.container.make('ace')
    ace.prompt.trap('Select the queue driver you plan to use').chooseOption(1) // database
    ace.ui.switchMode('raw')

    const command = await ace.create(Configure, ['../../index.js'])
    await command.exec()

    await assert.fileContains('config/queue.ts', 'drivers.database')
    await assert.fileContains('.env', 'QUEUE_DRIVER=database')

    const migrationDir = join(BASE_PATH, 'database/migrations')
    const migrationFiles = await readdir(migrationDir)
    const hasQueueMigration = migrationFiles.some((file) =>
      file.endsWith('_create_queue_tables.ts')
    )

    assert.isTrue(hasQueueMigration)
  })
})
