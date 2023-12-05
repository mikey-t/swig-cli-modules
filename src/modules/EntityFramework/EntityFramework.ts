import { Emoji, getConfirmation, log, mkdirp, spawnAsync } from '@mikeyt23/node-cli-utils'
import { ensureDotnetTool, runtimeIds } from '@mikeyt23/node-cli-utils/dotnetUtils'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { inspect } from 'node:util'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import { getDbContextNamesForEfAction, getDbContextsForSetupFromCliArgs, logDbCommandMessage, throwIfConfigInvalid } from './EntityFrameworkInternal.js'
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
  const dbContexts = getDbContextsForSetupFromCliArgs()

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
  const dbContexts = getDbContextsForSetupFromCliArgs()

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

/**
 * Outputs swig EF module config if the init method has been called in the swigfile.
 */
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

/**
 * Runs the dotnet ef bundle command. The project path and runtime id from config will be used in the command(s).
 * 
 * For each DbContext specified (or all that have `useWhenNoContextSpecified` set to `true`), generate a bundle for each of the runtime identifiers specified in the
 * ef config init call's optional `releaseRuntimeIds` param.
 * 
 * Example bundle command that will be generated:
 * 
 * ```bash
 * dotnet ef migrations bundle --project ./src/DbMigrations --context MainDbContext --self-contained -r win-x64 -o ./release/MigrateMainDbContext-win-x64.exe --force
 * ```
 */
export async function dbCreateRelease() {
  throwIfConfigInvalid()

  if (!config.releaseRuntimeIds || config.releaseRuntimeIds.length === 0) {
    throw new Error(`Config is missing releaseRuntimeIds`)
  }
  const invalidRuntimeIds = config.releaseRuntimeIds.filter(rid => !runtimeIds.includes(rid))
  if (invalidRuntimeIds.length > 0) {
    throw new Error(`Config for releaseRuntimeIds contains invalid runtime ids: ${invalidRuntimeIds.join(', ')}`)
  }

  const contexts = getDbContextsForSetupFromCliArgs()
  
  if (contexts.length === 0) {
    log(`${Emoji.Info} No DbContext matched your params - do one of the following:`)
    log(`  - Change your swig config so that at least one of the DbContext entries has 'useWhenNoContextSpecified' set to true, and pass no extra params to this task`)
    log(`  - Pass "all" as a single param after this task`)
    log(`  - Pass the 'cliKey' value for a single DbContext to operate on (as specified in swig config)`)
    log(`  - Pass the full DbContext class name for a single DbContext to operate on`)
    throw new Error(`Invalid params`)
  }
  
  logDbCommandMessage('Creating bundles', contexts.map(context => context.name))

  const releaseDir = 'release'
  log(`ensuring output directory exists: ${releaseDir}`)
  await mkdirp(releaseDir)

  const existingBundles = fs.readdirSync(releaseDir).filter(e => e.startsWith('Migrate') && e.endsWith('.exe'))
  if (existingBundles.length > 0) {
    log(`deleting existing release bundles: ${existingBundles.join(', ')}`)
    for (const bundle of existingBundles) {
      await fsp.rm(path.join(releaseDir, bundle))
    }
  }

  log(`creating releases for the following runtime ids for each DbContext: ${config.releaseRuntimeIds.join(', ')}`)
  for (const dbContext of contexts) {
    for (const rid of config.releaseRuntimeIds) {
      const outputFile = path.join(releaseDir, `Migrate${dbContext.name}-${rid}.exe`)

      const command = 'dotnet'
      const args: string[] = ['ef', 'migrations', 'bundle', '--project', config.dbMigrationsProjectPath!, '--context', dbContext.name, '--self-contained', '-r', rid, '-o', outputFile, '--force']

      log(`${Emoji.Info} Running command to generate EF bundle: ${command} ${args.join(' ')}`)
      const result = await spawnAsync(command, args)

      if (result.code !== 0) {
        throw new Error(`Error generating EF bundle`)
      }

      log(`${Emoji.GreenCheck} EF bundle generated: ${outputFile}`)
    }
  }
}
