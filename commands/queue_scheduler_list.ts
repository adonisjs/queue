/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class QueueSchedulerList extends BaseCommand {
  static commandName = 'queue:scheduler:list'
  static description = 'List all scheduled jobs'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.string({ description: 'Filter by status (active, paused)', alias: 's' })
  declare status?: string

  async run() {
    const { Schedule } = await import('@boringnode/queue')

    const options: { status?: 'active' | 'paused' } = {}
    if (this.status === 'active' || this.status === 'paused') {
      options.status = this.status
    }

    const schedules = await Schedule.list(options)

    if (schedules.length === 0) {
      this.logger.info('No schedules found')
      return
    }

    const table = this.ui.table()
    table.head(['ID', 'Job', 'Schedule', 'Status', 'Run Count', 'Next Run', 'Last Run'])

    for (const schedule of schedules) {
      const scheduleExpr = schedule.cronExpression ?? `every ${schedule.everyMs}ms`
      const nextRun = schedule.nextRunAt?.toISOString() ?? 'N/A'
      const lastRun = schedule.lastRunAt?.toISOString() ?? 'Never'

      table.row([
        schedule.id,
        schedule.name,
        scheduleExpr,
        schedule.status,
        String(schedule.runCount),
        nextRun,
        lastRun,
      ])
    }

    table.render()
  }
}
