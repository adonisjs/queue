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
import { defineConfig as defineDatabaseConfig } from '@adonisjs/lucid'
import { knex } from '@boringnode/queue/drivers/knex_adapter'

import { setupApp } from './helpers.js'
import QueueMigrate from '../commands/queue_migrate.js'
import { defineConfig, drivers } from '../index.js'

const BASE_URL = new URL('./tmp/', import.meta.url)

test.group('queue:migrate', (group) => {
  group.each.setup(({ context }) => {
    context.fs.baseUrl = BASE_URL
    context.fs.basePath = fileURLToPath(BASE_URL)
  })

  test('upgrades tables created by @boringnode/queue 0.7', async ({ assert, fs }) => {
    await fs.create('db.sqlite3', '')
    const app = await setupApp('console', {
      database: defineDatabaseConfig({
        connection: 'sqlite',
        connections: {
          sqlite: {
            client: 'better-sqlite3',
            connection: { filename: `${fs.basePath}/db.sqlite3` },
            useNullAsDefault: true,
          },
        },
      }),
      queue: defineConfig({ default: 'database', adapters: { database: drivers.database() } }),
    })

    const db = await app.container.make('lucid.db')

    /**
     * The 0.7 schema: dates in SQL date columns, and a non-unique dedup index.
     */
    await db.connection().schema.createTable('queue_jobs', (table) => {
      table.string('id').notNullable()
      table.string('queue').notNullable()
      table.string('status').notNullable()
      table.text('data').notNullable()
      table.bigint('score').nullable()
      table.string('worker_id').nullable()
      table.bigint('acquired_at').nullable()
      table.bigint('execute_at').nullable()
      table.bigint('finished_at').nullable()
      table.text('error').nullable()
      table.string('dedup_id', 510).nullable()
      table.bigint('dedup_at').nullable()
      table.bigint('dedup_ttl').nullable()
      table.primary(['id', 'queue'])
      table.index(['queue', 'dedup_id'])
    })
    await db.connection().schema.createTable('queue_schedules', (table) => {
      table.string('id').primary()
      table.string('status').notNullable().defaultTo('active')
      table.string('name').notNullable()
      table.text('payload').notNullable()
      table.string('cron_expression').nullable()
      table.bigint('every_ms').nullable()
      table.string('timezone').notNullable().defaultTo('UTC')
      table.timestamp('from_date').nullable()
      table.timestamp('to_date').nullable()
      table.integer('run_limit').nullable()
      table.integer('run_count').notNullable().defaultTo(0)
      table.timestamp('next_run_at').nullable()
      table.timestamp('last_run_at').nullable()
      table
        .timestamp('created_at')
        .notNullable()
        .defaultTo(db.connection().knexRawQuery('CURRENT_TIMESTAMP'))
    })
    await db.table('queue_schedules').insert({
      id: 'nightly',
      name: 'NightlyJob',
      payload: '{}',
      every_ms: 60_000,
      from_date: '2026-01-15 10:00:00',
    })

    const ace = await app.container.make('ace')
    ace.ui.switchMode('raw')

    const command = await ace.create(QueueMigrate, [])
    await command.exec()

    command.assertSucceeded()
    command.assertLog('[ green(success) ] database: up to date')

    const schedule = await db.from('queue_schedules').where('id', 'nightly').firstOrFail()
    assert.equal(schedule.from_date, Date.UTC(2026, 0, 15, 10))

    const indexes = await db.rawQuery(
      `select name from sqlite_master where type = 'index' and tbl_name = 'queue_jobs'`
    )
    const names = indexes.map((index: { name: string }) => index.name)
    assert.include(names, 'queue_jobs_dedup_uidx')
    assert.notInclude(names, 'queue_jobs_queue_dedup_id_index')
  })

  test('warns about SQL tables it cannot upgrade', async ({ fs }) => {
    await fs.create('db.sqlite3', '')

    const app = await setupApp('console', {
      queue: defineConfig({
        default: 'database',
        adapters: {
          database: knex({
            client: 'better-sqlite3',
            connection: { filename: `${fs.basePath}/db.sqlite3` },
            useNullAsDefault: true,
          }),
        },
      }),
    })

    const ace = await app.container.make('ace')
    ace.ui.switchMode('raw')

    const command = await ace.create(QueueMigrate, [])
    await command.exec()

    command.assertSucceeded()
    command.assertLogMatches(/database: cannot upgrade the tables/)
  })
})
