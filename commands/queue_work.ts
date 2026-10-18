/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { flags, BaseCommand } from '@adonisjs/core/ace'
import { resolveAdapters, resolveHotReload, resolveJobFactory } from '../src/utils.js'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { QueueConfig, QueueManagerConfig } from '../src/types/main.js'

export default class QueueWork extends BaseCommand {
  static commandName = 'queue:work'
  static description = 'Start processing jobs from the queue'

  static options: CommandOptions = {
    startApp: true,
    staysAlive: true,
  }

  @flags.string({ description: 'Comma-separated list of queues to process', alias: 'q' })
  declare queue?: string

  @flags.boolean({ description: 'Process the default queue and every queue of the config' })
  declare allQueues?: boolean

  @flags.number({ description: 'Number of jobs to process concurrently', alias: 'c' })
  declare concurrency?: number

  @flags.string({ description: 'Name of the adapter to process jobs from', alias: 'a' })
  declare adapter?: string

  @flags.boolean({ description: 'Reload jobs on file change, using hot-hook (development only)' })
  declare hmr?: boolean

  async run() {
    if (this.queue && this.allQueues) {
      this.logger.error('Cannot use --queue and --all-queues flags together. Choose one of them')
      this.exitCode = 1
      return this.terminate()
    }

    const config = this.app.config.get<QueueConfig>('queue')

    if (this.adapter && !(this.adapter in config.adapters)) {
      this.logger.error(`Adapter "${this.adapter}" is not configured`)
      this.exitCode = 1
      return this.terminate()
    }

    if (this.hmr) {
      return this.#runWithHmr()
    }

    const { Worker } = await import('@boringnode/queue')
    const queueManager = await this.app.container.make('queue.manager')
    const logger = await this.app.container.make('logger')

    /**
     * Commit the router to ensure all routes are registered.
     * This is required when jobs dispatch HTTP requests or
     * use URL generation.
     */
    const router = await this.app.container.make('router')
    router.commit()

    const resolvedAdapters = await resolveAdapters(config, this.app)
    const queues = this.queue
      ? this.queue.split(',').map((q) => q.trim())
      : this.allQueues
        ? [...new Set(['default', ...Object.keys(config.queues ?? {})])]
        : ['default']

    await queueManager.loadJobs()

    this.logger.info(`Starting worker for queues: ${queues.join(', ')}`)
    const jobFactory = resolveJobFactory(config, this.app)

    const workerConfig = {
      ...config,
      autoLoadJobs: false,
      adapters: resolvedAdapters,
      jobFactory,
      hotReload: resolveHotReload(config),
      logger: config.logger ?? logger,
      worker: {
        ...config.worker,
        ...(this.concurrency !== undefined ? { concurrency: this.concurrency } : {}),
        ...(this.adapter !== undefined ? { adapter: this.adapter } : {}),
      },
    } satisfies QueueManagerConfig

    /**
     * `start()` resolves once the worker stopped (SIGTERM, SIGINT) and every
     * running job is finalized. Terminating the app then destroys the
     * QueueManager and closes the connections it used (Redis, Lucid), so
     * the process can exit.
     */
    try {
      const worker = new Worker(workerConfig)

      /**
       * The app terminates on SIGTERM (see bin/console.ts). Stop the worker
       * first, or the provider would destroy the QueueManager under it.
       */
      this.app.terminating(() => worker.stop())

      await worker.start(queues)
    } catch (error) {
      /**
       * Ace sets the exit code of a command that stays alive when the
       * app terminates, which happens before it handles this error.
       */
      this.exitCode = 1
      throw error
    } finally {
      await this.terminate()
    }
  }

  /**
   * Runs the worker in a child process loaded with hot-hook, the way
   * `node ace serve --hmr` runs the HTTP server. A changed job reloads on
   * its next execution. A change hot-hook cannot reload, such as a config
   * file, restarts the child once its running jobs are finalized.
   */
  async #runWithHmr() {
    const args = ['queue:work']
    if (this.queue !== undefined) args.push(`--queue=${this.queue}`)
    if (this.allQueues) args.push('--all-queues')
    if (this.concurrency !== undefined) args.push(`--concurrency=${this.concurrency}`)
    if (this.adapter !== undefined) args.push(`--adapter=${this.adapter}`)

    let restarting = false

    const exitCode = await new Promise<number>((resolve) => {
      const start = () => {
        const child = fork(this.app.makePath('bin/console.ts'), args, {
          cwd: fileURLToPath(this.app.appRoot),
          execArgv: [
            '--import=@poppinss/ts-exec',
            '--enable-source-maps',
            '--import=hot-hook/register',
          ],
          stdio: 'inherit',
        })

        const stop = () => {
          restarting = false
          child.kill('SIGTERM')
        }
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)

        child.on('message', (message: { type?: string }) => {
          if (message?.type === 'hot-hook:full-reload' && !restarting) {
            this.logger.info('Full reload required, restarting the worker')
            restarting = true
            child.kill('SIGTERM')
          }
        })

        child.on('exit', (code) => {
          process.off('SIGINT', stop)
          process.off('SIGTERM', stop)

          if (restarting) {
            restarting = false
            return start()
          }

          resolve(code ?? 0)
        })
      }

      start()
    })

    this.exitCode = exitCode
    await this.terminate()
  }
}
