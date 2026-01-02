/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { args, BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class QueueSchedulerRemove extends BaseCommand {
  static commandName = 'queue:scheduler:remove'
  static description = 'Remove a scheduled job by ID'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'ID of the schedule to remove' })
  declare id: string

  async run() {
    const { Schedule } = await import('@boringnode/queue')

    const schedule = await Schedule.find(this.id)

    if (!schedule) {
      this.logger.error(`Schedule "${this.id}" not found`)
      this.exitCode = 1
      return
    }

    if (this.app.inProduction) {
      const confirmed = await this.prompt.confirm(
        `Are you sure you want to remove schedule "${this.id}"?`
      )
      if (!confirmed) {
        return
      }
    }

    await schedule.delete()
    this.logger.success(`Schedule "${this.id}" removed successfully`)
  }
}
