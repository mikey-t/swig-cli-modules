import { getConfirmation, log, requireString, requireValidPath, spawnAsync } from '@mikeyt23/node-cli-utils'
import { dotnetBuild } from '@mikeyt23/node-cli-utils/dotnetUtils'
import { DbContextConfig } from '../../config/EntityFrameworkConfig.js'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import {
  addDbMigrationBoilerplate,
  deleteScriptFileIfEmpty,
  getDbContextsForEfActionFromCliArgs,
  getDbContextsTraceString,
  getLastMigrationName,
  getMigrationNameArg,
  getMigrationsProjectRelativePath,
  getScriptPath,
  throwIfConfigInvalid
} from './EntityFrameworkInternal.js'

/**
 * This function is outside the main EntityFramework module because it's not normally wired up directly as a swig task, but rather
 * it can be imported and called directly against specific DbContexts (via their cli keys). Useful for customized automation.
 * @param action The dotnet-ef command to call - accepts one of the following: 'list', 'update', 'add', 'remove'.
 * @param dbContextOverrideCliKeys An array of cli keys for the DbContexts to operate on (using the EntityFrameworkConfig singleton).
 */
export async function executeEfAction(action: 'list' | 'update' | 'add' | 'remove', dbContextOverrideCliKeys?: string[]) {
  throwIfConfigInvalid(true)
  const migratorPath = config.dbMigrationsProjectPath!

  let contexts: DbContextConfig[] = []

  if (dbContextOverrideCliKeys && dbContextOverrideCliKeys.length > 0) {
    const overrideContexts = config.dbContexts.filter(context => dbContextOverrideCliKeys.includes(context.cliKey))
    if (overrideContexts.length === 0) {
      throw new Error('The executeEfAction function was called with a dbContextOverrideCliKeys but config did not contain DbContextConfig entries with the CLI keys provided')
    }
    contexts = overrideContexts
  } else {
    contexts = getDbContextsForEfActionFromCliArgs()
  }

  const migrationName = getMigrationNameArg()

  log(`DbContextConfigs:\n${getDbContextsTraceString(contexts)}`)
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
        await efAddMigration(migratorPath, context.name, migrationName!, true, context.scriptsSubdirectory)
        break
      case 'remove':
        log(`removing last migration from ➡️${context.name}`)
        await efRemoveLastMigration(migratorPath, context.name, false, context.scriptsSubdirectory)
        break
    }
  }
}

/**
 * Wrapper function for `dotnet ef`. If you don't pass `false` for `noBuild`, be sure the project has already been built by some other means.
 * 
 * Docs for "dotnet ef" CLI: https://learn.microsoft.com/en-us/ef/core/cli/dotnet.
 * @param projectPath Path to project that has the DbContext and Migration files used for the `--project` argument
 * @param dbContextName The name of the DbContext class used for the `--context` argument
 * @param args Arguments to pass to the `dotnet ef` CLI
 * @param noBuild If true, the `--no-build` argument will be passed to the `dotnet ef` CLI (default: true)
 */
export async function dotnetEfCommand(projectPath: string, dbContextName: string, args: string[], noBuild = true): Promise<number> {
  requireValidPath('projectPath', projectPath)
  requireString('dbContextName', dbContextName)
  const result = await spawnAsync('dotnet', ['ef', '--project', projectPath, ...args, '--context', dbContextName, ...(noBuild ? ['--no-build'] : [])])
  return result.code
}

/**
 * Wrapper function for `dotnet ef migrations list`.
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 */
export async function efMigrationsList(projectPath: string, dbContextName: string) {
  await dotnetEfCommand(projectPath, dbContextName, ['migrations', 'list'],)
}

/**
 * Wrapper function for `dotnet ef database update <migration_name>`.
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 * @param migrationName The name of the migration to update to (optional). If not provided, all migrations will be applied.
 */
export async function efMigrationsUpdate(projectPath: string, dbContextName: string, migrationName?: string) {
  await dotnetEfCommand(projectPath, dbContextName, ['database', 'update', ...(migrationName ? [migrationName] : [])])
}

/**
 * 
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 * @param migrationName The name of the migration to add
 * @param withBoilerplate If true, boilerplate will be added to the migration C# file and empty Up and Down SQL files will be created
 */
export async function efAddMigration(projectPath: string, dbContextName: string, migrationName: string, withBoilerplate = false, scriptsSubdirectory?: string) {
  const projectDirectory = projectPath.endsWith('.csproj') ? projectPath.substring(0, projectPath.lastIndexOf('/')) : projectPath
  const migrationsOutputDir = getMigrationsProjectRelativePath(dbContextName)
  await dotnetEfCommand(projectPath, dbContextName, ['migrations', 'add', migrationName, '-o', migrationsOutputDir])
  if (withBoilerplate) {
    try {
      await addDbMigrationBoilerplate(projectDirectory, dbContextName, migrationName, scriptsSubdirectory)
    } catch (error) {
      console.error(error)
      await efRemoveLastMigration(projectPath, dbContextName, true, scriptsSubdirectory)
    }
  }
}

/**
 * 
 * @param projectPath The path to the project that contains the DbContext and Migration files
 * @param dbContextName The name of the DbContext class
 * @param skipConfirm If `true`, the user will not be prompted to confirm the removal of the last migration
 */
export async function efRemoveLastMigration(projectPath: string, dbContextName: string, skipConfirm = false, scriptsSubdirectory?: string) {
  const lastMigrationName = await getLastMigrationName(projectPath, dbContextName)

  if (!skipConfirm && !await getConfirmation(`Are you sure you want to remove the last migration: ➡️${lastMigrationName}?`)) {
    return
  }

  const returnCode = await dotnetEfCommand(projectPath, dbContextName, ['migrations', 'remove'])
  if (returnCode !== 0) {
    throw new Error(`dotnet ef migrations remove returned non-zero exit code: ${returnCode}`)
  }

  log(`Removing migration SQL script files if they're empty`)
  await deleteScriptFileIfEmpty(getScriptPath(projectPath, lastMigrationName, true, scriptsSubdirectory))
  await deleteScriptFileIfEmpty(getScriptPath(projectPath, lastMigrationName, false, scriptsSubdirectory))
}
