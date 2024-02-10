import { Emoji, getConfirmation, log, mkdirp, spawnAsync } from '@mikeyt23/node-cli-utils'
import { ensureDotnetTool, runtimeIds } from '@mikeyt23/node-cli-utils/dotnetUtils'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { inspect } from 'node:util'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import { getDbContextNamesForEfAction, getDbContextsForSetupFromCliArgs, logDbCommandMessage, runBeforeHooks, throwIfConfigInvalid } from './EntityFrameworkInternal.js'
import { executeEfAction } from './EntityFrameworkUtils.js'

export async function ensureDotnetEfToolInstalled() {
  throwIfConfigInvalid(false)
  await ensureDotnetTool('dotnet-ef', { dotnetMajorVersion: config.dotnetSdkVersion })
}

export async function dbListMigrations() {
  const dbContextNames = getDbContextNamesForEfAction()
  throwIfNoDbContexts(dbContextNames)
  logDbCommandMessage('Listing migrations', dbContextNames)
  await executeEfAction('list')
}

export async function dbMigrate() {
  const dbContextNames = getDbContextNamesForEfAction()
  throwIfNoDbContexts(dbContextNames)
  logDbCommandMessage('Updating database', dbContextNames)
  await executeEfAction('update')
}

export async function dbAddMigration() {
  const dbContextNames = getDbContextNamesForEfAction()
  throwIfNoDbContexts(dbContextNames)
  logDbCommandMessage('Adding migration', dbContextNames)
  await executeEfAction('add')
}

export async function dbRemoveMigration() {
  const dbContextNames = getDbContextNamesForEfAction()
  throwIfNoDbContexts(dbContextNames)
  logDbCommandMessage('Removing last migration', dbContextNames)
  await executeEfAction('remove')
}

export { dbBootstrapDbContext, dbBootstrapMigrationsProject } from './EntityFrameworkBootstrap.js'

/**
 * Thin wrapper around "setup" command for C# console app that's using MikeyT.DbMigrations DbSetupCli. Pass space separated DbContext names
 * (or cli keys from config) to operate on (or no extra params to operate on all DbContexts that don't have "useWhenNoContextSpecified" to false).
 */
export async function dbSetup() {
  const dbContexts = getDbContextsForSetupFromCliArgs()
  throwIfNoDbContexts(dbContexts)

  throwIfConfigInvalid()

  await runBeforeHooks()

  log(`Running setup for DbContext(s):\n${dbContexts.map(c => `  ${c.name}`).join('\n')}`)

  for (const dbContext of dbContexts) {
    await spawnAsync('dotnet', ['run', '--', 'setup', dbContext.name], { cwd: config.dbMigrationsProjectPath! })
  }

  log(`${Emoji.GreenCheck} setup complete`)
}

/**
 * Thin wrapper around "teardown" command for C# console app that's using MikeyT.DbMigrations DbSetupCli. Pass space separated DbContext names
 * (or cli keys from config) to operate on (or no extra params to operate on all DbContexts that don't have "useWhenNoContextSpecified" to false).
 */
export async function dbTeardown() {
  const dbContexts = getDbContextsForSetupFromCliArgs()
  throwIfNoDbContexts(dbContexts)

  throwIfConfigInvalid()

  await runBeforeHooks()

  log(`Running teardown for DbContext(s):\n${dbContexts.map(c => `  ${c.name}`).join('\n')}`)

  for (const dbContext of dbContexts) {
    if (!await getConfirmation(`Are you sure you want to completely destroy the database for the DbContext "${dbContext.name}"`)) {
      continue
    }
    await spawnAsync('dotnet', ['run', '--', 'teardown', dbContext.name], { cwd: config.dbMigrationsProjectPath! })
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

efConfig.init('src/DbMigrations', [{ name: 'MainDbContext', cliKey: 'main', dbSetupType: 'PostgresSetup' }])

export * from 'swig-cli-modules/EntityFramework'
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
 * CLI usage: `swig dbCreateRelease [<CLI_KEY>|all]`
 * 
 * Swigfile usage: import this function and pass the full DbContext name to dbContextNameOverride function param, which will be used instead of cli params.
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
export async function dbCreateRelease(dbContextNameOverride?: string) {
  throwIfConfigInvalid()

  await runBeforeHooks()

  if (!config.releaseRuntimeIds || config.releaseRuntimeIds.length === 0) {
    throw new Error(`Config is missing releaseRuntimeIds`)
  }
  const invalidRuntimeIds = config.releaseRuntimeIds.filter(rid => !runtimeIds.includes(rid))
  if (invalidRuntimeIds.length > 0) {
    throw new Error(`Config for releaseRuntimeIds contains invalid runtime ids: ${invalidRuntimeIds.join(', ')}`)
  }

  const contexts = dbContextNameOverride ? config.dbContexts.filter(c => c.name === dbContextNameOverride) : getDbContextsForSetupFromCliArgs()
  throwIfNoDbContexts(contexts)

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

function throwIfNoDbContexts(dbContexts: unknown[]) {
  if (dbContexts.length === 0) {
    log(`${Emoji.Info} No DbContext matched your params - do one of the following:`)
    log(`  - Change your swig config so that at least one of the DbContext entries omits the 'useWhenNoContextSpecified' option (or sets to true), and pass no extra params to this task`)
    log(`  - Pass "all" as a single param after this task`)
    log(`  - Pass the 'cliKey' value for a single DbContext to operate on (as specified in swig config)`)
    log(`  - Pass the full DbContext class name for a single DbContext to operate on`)
    throw new Error(`No DbContexts to operate on`)
  }
}
