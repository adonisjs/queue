/*
 * @adonisjs/queue
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class QueueSchedulerClear extends BaseCommand {
  static commandName = 'queue:scheduler:clear'
  static description = 'Remove all scheduled jobs'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { Schedule } = await import('@boringnode/queue')

    const schedules = await Schedule.list()

    if (schedules.length === 0) {
      this.logger.info('No schedules to clear')
      return
    }

    if (this.app.inProduction) {
      const confirmed = await this.prompt.confirm(
        `Are you sure you want to remove all ${schedules.length} schedules?`
      )

      if (!confirmed) {
        return
      }
    }

    for (const schedule of schedules) {
      await schedule.delete()
    }

    this.logger.success(`Removed ${schedules.length} schedules successfully`)
  }
}
