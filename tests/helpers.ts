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
import type { AppEnvironments } from '@adonisjs/core/types/app'

import { defineConfig, drivers } from '../index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

export async function setupApp(
  env?: AppEnvironments,
  config: {
    queue?: ReturnType<typeof defineConfig>
  } = {}
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
      },
      rcFileContents: {
        providers: [() => import('../providers/queue_provider.js')],
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
  await app.init().then(() => app.boot())

  getActiveTest()?.cleanup(() => app.terminate())

  return app
}
