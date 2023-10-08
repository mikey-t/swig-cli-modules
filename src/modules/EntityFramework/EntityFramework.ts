import { log } from '@mikeyt23/node-cli-utils'
import { efAddMigration, efMigrationsList, efMigrationsUpdate, efRemoveLastMigration } from '@mikeyt23/node-cli-utils/dbMigrationUtils'
import { dotnetBuild } from '@mikeyt23/node-cli-utils/dotnetUtils'
import { DbContextConfig } from '../../config/EntityFrameworkConfig.js'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'

export async function listMigrations() {
  logDbCommandMessage('Listing migrations', getDbContextNamesToOperateOn())
  await executeEfAction('list')
}

export async function dbMigrate() {
  logDbCommandMessage('Updating database', getDbContextNamesToOperateOn())
  await executeEfAction('update')
}

export async function addMigration() {
  logDbCommandMessage('Adding migration', getDbContextNamesToOperateOn())
  await executeEfAction('add')
}

export async function removeMigration() {
  logDbCommandMessage('Removing last migration', getDbContextNamesToOperateOn())
  await executeEfAction('remove')
}

export async function executeEfAction(action: 'list' | 'update' | 'add' | 'remove', dbContextOverrideCliKeys?: string[]) {
  config.throwIfInvalid()
  const migratorPath = config.dbMigratorPath!

  let contexts: DbContextConfig[] = []

  if (dbContextOverrideCliKeys && dbContextOverrideCliKeys.length > 0) {
    const overrideContexts = config.dbContexts.filter(context => dbContextOverrideCliKeys.includes(context.cliKey))
    if (overrideContexts.length === 0) {
      throw new Error('The executeEfAction function was called with a dbContextOverrideCliKeys but config did not contain DbContextConfig entries with the CLI keys provided')
    }
    contexts = overrideContexts
  } else {
    contexts = getDbContextsToOperateOn()
  }

  const migrationName = getMigrationNameArg()

  log(`DbContextConfigs: ${getDbContextsTraceString(contexts)}`)
  if (migrationName) {
    log(`migrationName: ${migrationName}`)
  }

  if (action === 'add' && !migrationName) {
    throw new Error('Missing migration name')
  }

  // Build once explicitly so that all subsequent commands can use the noBuild option.
  // This will speed up operations that require multiple 'dotnet ef' commands.
  await dotnetBuild(migratorPath)

  for (const context of contexts) {
    switch (action) {
      case 'list':
        await efMigrationsList(migratorPath, context.name)
        break
      case 'update':
        log(migrationName ? `Updating ➡️${context.name} to migration name: ${migrationName}` : `Updating ➡️${context.name} to latest migration`)
        await efMigrationsUpdate(migratorPath, context.name, migrationName)
        break
      case 'add':
        log(`adding migration ➡️${migrationName} to ➡️${context.name}`)
        await efAddMigration(migratorPath, context.name, migrationName!, true)
        break
      case 'remove':
        log(`removing last migration from ➡️${context.name}`)
        await efRemoveLastMigration(migratorPath, context.name)
        break
    }
  }
}

function getDbContextCliKeys() {
  return config.dbContexts.map(context => context.cliKey)
}

function getDbContextsToOperateOn(): DbContextConfig[] {
  const firstArg = process.argv[3]
  const secondArg = process.argv[4]

  const contextsIfNotSpecified = config.dbContexts.filter(context => context.useWhenNoContextSpecified)

  if (!firstArg) {
    return contextsIfNotSpecified
  }

  if (firstArg === 'all') {
    return config.dbContexts
  }

  const cliKeys = getDbContextCliKeys()

  if (cliKeys.includes(firstArg)) {
    return config.dbContexts.filter(context => context.cliKey === firstArg)
  }

  // If 2 args passed, the first should be the DbContext CLI key and the second should be the migration name
  if (secondArg) {
    throw new Error(`Unrecognized DbContext CLI key: ${firstArg}`)
  }

  // Only one arg passed and it's not one of the available CLI keys - assume it's the migration name
  return contextsIfNotSpecified
}

function getDbContextNamesToOperateOn(): string[] {
  return getDbContextsToOperateOn().map(context => context.name)
}

function getMigrationNameArg(): string | undefined {
  const migrationName = process.argv[4] || process.argv[3]
  // If only one arg is passed it can be the CLI key of the context to use instead of the migration name
  if (!process.argv[4] && (migrationName === 'all' || getDbContextCliKeys().includes(migrationName))) {
    return undefined
  }
  return migrationName && !getDbContextCliKeys().includes(migrationName) ? migrationName : undefined
}

function logDbCommandMessage(prefix: string, dbContextNames: string[]) {
  log(`${prefix} using project path 📁${config.dbMigratorPath} and db context${dbContextNames.length > 1 ? 's' : ''}: ${dbContextNames.map(n => `➡️${n}`).join(', ')}`)
}

function getDbContextsTraceString(contexts: DbContextConfig[]) {
  return contexts.map(context => `name: ${context.name}, cliKey: ${context.cliKey}})`).join(' | ')
}
