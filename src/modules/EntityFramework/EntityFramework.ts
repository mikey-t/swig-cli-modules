import { Emoji, getConfirmation, log, spawnAsync } from '@mikeyt23/node-cli-utils'
import { ensureDotnetTool } from '@mikeyt23/node-cli-utils/dotnetUtils'
import { inspect } from 'node:util'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import { getDbContextNamesForEfAction, getDbContextsForSetupCli, logDbCommandMessage, throwIfConfigInvalid } from './EntityFrameworkInternal.js'
import { executeEfAction } from './EntityFrameworkUtils.js'

export async function ensureDotnetEfToolInstalled() {
  throwIfConfigInvalid(false)
  await ensureDotnetTool('dotnet-ef', { dotnetMajorVersion: config.dotnetSdkVersion })
}

export async function dbListMigrations() {
  logDbCommandMessage('Listing migrations', getDbContextNamesForEfAction())
  await executeEfAction('list')
}

export async function dbMigrate() {
  logDbCommandMessage('Updating database', getDbContextNamesForEfAction())
  await executeEfAction('update')
}

export async function dbAddMigration() {
  logDbCommandMessage('Adding migration', getDbContextNamesForEfAction())
  await executeEfAction('add')
}

export async function dbRemoveMigration() {
  logDbCommandMessage('Removing last migration', getDbContextNamesForEfAction())
  await executeEfAction('remove')
}

export { dbBootstrapDbContext, dbBootstrapMigrationsProject } from './EntityFrameworkBootstrap.js'

/**
 * Thin wrapper around "setup" command for C# console app that's using MikeyT.DbMigrations DbSetupCli. Pass space separated DbContext names (or cli keys from config) to operate on.
 */
export async function dbSetup() {
  const dbContexts = getDbContextsForSetupCli()

  throwIfConfigInvalid()

  log(`Running setup for DbContext(s):\n${dbContexts.map(c => `  ${c.name}`).join('\n')}`)

  for (const dbContext of dbContexts) {
    await spawnAsync('dotnet', ['run', '--', 'setup', dbContext.name], { cwd: config.dbMigrationsProjectPath!, throwOnNonZero: true })
  }

  log(`${Emoji.GreenCheck} setup complete`)
}

/**
 * Thin wrapper around "teardown" command for C# console app that's using MikeyT.DbMigrations DbSetupCli. Pass space separated DbContext names (or cli keys from config) to operate on.
 */
export async function dbTeardown() {
  const dbContexts = getDbContextsForSetupCli()

  throwIfConfigInvalid()

  log(`Running teardown for DbContext(s):\n${dbContexts.map(c => `  ${c.name}`).join('\n')}`)

  for (const dbContext of dbContexts) {
    if (!await getConfirmation(`Are you sure you want to completely destroy the database for the DbContext "${dbContext.name}"`)) {
      continue
    }
    await spawnAsync('dotnet', ['run', '--', 'teardown', dbContext.name], { cwd: config.dbMigrationsProjectPath!, throwOnNonZero: true })
  }

  log(`${Emoji.GreenCheck} teardown complete`)
}

export async function dbShowConfig() {
  if (!config.initCalled) {
    const err = `No config found. You must first import the config singleton and call it's "init" method in your swigfile. For example:
    
import efConfig from 'swig-cli-modules/ConfigEntityFramework'

const dbMigrationsPath = 'src/DbMigrations'

efConfig.init(
  dbMigrationsPath,
  [
    { name: 'MainDbContext', cliKey: 'main', dbSetupType: 'PostgresSetup', useWhenNoContextSpecified: true },
    { name: 'TestDbContext', cliKey: 'test', dbSetupType: 'PostgresSetup', useWhenNoContextSpecified: true }
  ]
)
`
    throw new Error(err)
  }
  const configForPrinting = {
    dbMigrationsProjectPath: config.dbMigrationsProjectPath,
    dbContexts: config.dbContexts
  }
  log(inspect(configForPrinting, { colors: true }))
}
