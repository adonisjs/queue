/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

import { stubsRoot } from './stubs/main.js'
import type Configure from '@adonisjs/core/commands/configure'

const DRIVERS = ['redis', 'database'] as const
const DRIVERS_INFO: Record<
  (typeof DRIVERS)[number],
  {
    envVars?: Record<string, string>
    envValidations?: Record<string, string>
  }
> = {
  redis: {},
  database: {},
}

type PackageJson = Record<string, unknown> & {
  imports?: Record<string, string>
}

/**
 * Defines the "#jobs/*" subpath import inside the project package.json
 * file. Job classes are referenced using this alias (for example inside
 * the scheduler preload file), so we make sure it is always defined.
 */
async function defineJobsImport(packageJsonPath: string) {
  /**
   * Do not create a package.json from scratch. Only update the
   * one that already exists.
   */
  if (!existsSync(packageJsonPath)) {
    return
  }

  const packageJson: PackageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))

  packageJson.imports = {
    ...packageJson.imports,
    '#jobs/*': './app/jobs/*.js',
  }

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

/**
 * Configures the package
 */
export async function configure(command: Configure) {
  const driver = await command.prompt.choice(
    'Select the queue driver you plan to use',
    ['redis', 'database'],
    { hint: 'You can always change it later' }
  )

  const codemods = await command.createCodemods()

  /**
   * Register provider, command and preload file
   */
  await codemods.updateRcFile((rcFile) => {
    rcFile
      .addProvider('@adonisjs/queue/queue_provider')
      .addCommand('@adonisjs/queue/commands')
      .addPreloadFile('#start/scheduler', ['web'])
  })

  /**
   * Define the "#jobs/*" import alias used to reference job classes
   */
  await defineJobsImport(command.app.makePath('package.json'))

  /**
   * Define environment variables
   */
  await codemods.defineEnvVariables({ QUEUE_DRIVER: driver })

  /**
   * Define environment validations
   */
  await codemods.defineEnvValidations({
    variables: {
      QUEUE_DRIVER: `Env.schema.enum(['redis', 'database', 'sync'] as const)`,
    },
    leadingComment: 'Variables for configuring @adonisjs/queue',
  })

  const { envVars, envValidations } = DRIVERS_INFO[driver]

  if (envVars) {
    await codemods.defineEnvVariables(envVars)
  }

  if (envValidations) {
    await codemods.defineEnvValidations({ variables: envValidations })
  }

  /**
   * Publish config file
   */
  await codemods.makeUsingStub(stubsRoot, 'config/queue.stub', { driver })

  /**
   * Publish scheduler preload file
   */
  await codemods.makeUsingStub(stubsRoot, 'start/scheduler.stub', {})

  /**
   * Create migration for database driver
   */
  if (driver === 'database') {
    await codemods.makeUsingStub(stubsRoot, 'migration.stub', {
      entity: command.app.generators.createEntity('queue'),
      migration: {
        folder: 'database/migrations',
        fileName: `${new Date().getTime()}_create_queue_tables.ts`,
      },
    })
  }
}
