/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getActiveTest } from '@japa/runner'
import { IgnitorFactory } from '@adonisjs/core/factories'
import type { AppEnvironments, ApplicationModes } from '@adonisjs/core/types/app'
import type { DatabaseConfig } from '@adonisjs/lucid/types/database'

import { defineConfig, drivers } from '../index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

export async function setupApp(
  env?: AppEnvironments,
  config: {
    queue?: ReturnType<typeof defineConfig>
    database?: DatabaseConfig
  } = {},
  mode?: ApplicationModes
) {
  const ignitor = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .merge({
      config: {
        queue:
          config.queue ||
          defineConfig({
            default: 'sync',
            adapters: {
              sync: drivers.sync(),
            },
          }),
        database: config.database,
      },
      rcFileContents: {
        providers: [
          ...(config.database ? [() => import('@adonisjs/lucid/database_provider')] : []),
          () => import('../providers/queue_provider.js'),
        ],
      },
    })
    .create(BASE_URL, {
      importer: (filePath) => {
        if (filePath.startsWith('./') || filePath.startsWith('../')) {
          return import(new URL(filePath, BASE_URL).href)
        }

        return import(filePath)
      },
    })

  const app = ignitor.createApp(env || 'web')
  if (mode) {
    app.setMode(mode)
  }

  await app.init().then(() => app.boot())

  getActiveTest()?.cleanup(() => app.terminate())

  return app
}
