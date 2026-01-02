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
import { stubsRoot } from '../stubs/main.js'

export default class MakeJob extends BaseCommand {
  static commandName = 'make:job'
  static description = 'Create a new job class'

  static options: CommandOptions = {
    allowUnknownFlags: true,
  }

  @args.string({ description: 'Name of the job' })
  declare name: string

  async run() {
    const codemods = await this.createCodemods()
    await codemods.makeUsingStub(stubsRoot, 'make/job/main.stub', {
      flags: this.parsed.flags,
      entity: this.app.generators.createEntity(this.name),
    })
  }
}
