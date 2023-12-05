import { Emoji, isChildPath, isValidDirName, log, mkdirp, trace } from '@mikeyt23/node-cli-utils'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { supportedDotnetSdkVersions } from '../../config/EntityFrameworkConfig.js'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import { DbContextConfig } from './DbContextConfig.js'

export function throwIfConfigInvalid(requireDbContexts = true, requireDbMigrationsPath = true) {
  const errorPrefix = '[SwigEntityFrameworkConfig error] '
  if (!config.initCalled) {
    throw new Error(`${errorPrefix}You need to import the config singleton from "swig-cli-modules/ConfigEntityFramework" and call it's "init" function`)
  }
  if (!config.dbMigrationsProjectPath) {
    throw new Error(`${errorPrefix}dbMigrationsProjectPath is required`)
  }
  if (requireDbMigrationsPath && !fs.existsSync(config.dbMigrationsProjectPath)) {
    throw new Error(`${errorPrefix}dbMigrationsProjectPath path does not exist: ${config.dbMigrationsProjectPath}. Try running the swig task dbBootstrapMigrationsProject.`)
  }
  if (!isChildPath(process.cwd(), config.dbMigrationsProjectPath)) {
    throw new Error(`The config dbMigrationsProjectPath (${config.dbMigrationsProjectPath}) must be a child path of the current working directory`)
  }
  if (config.dbContexts?.length > 0) {
    for (const context of config.dbContexts) {
      if (context.scriptsSubdirectory !== undefined) {
        if (!isValidDirName(context.scriptsSubdirectory)) {
          throw new Error(`${errorPrefix}an invalid path was specified for the "scriptsSubdirectory" property of the DbContext "${context.name}": ${context.scriptsSubdirectory}`)
        }
      }
    }
  }
  if (requireDbContexts && config.dbContexts.length === 0) {
    throw new Error(`${errorPrefix}dbContexts must have at least one entry`)
  }
  if (!config.dotnetSdkVersion || !supportedDotnetSdkVersions.includes(config.dotnetSdkVersion)) {
    throw new Error(`${errorPrefix}unsupported dotnet SDK version specified: "${config.dotnetSdkVersion}". Only the following versions are supported: ${supportedDotnetSdkVersions.join(', ')}.`)
  }
}

// This is a very loose check to see if the DbMigrator project is already setup.
// Only checks that the directory exists and has a .csproj file in it.
export async function migratorProjectExists(): Promise<boolean> {
  trace(`checking if migrator project exists at ${config.dbMigrationsProjectPath}...`)
  if (!config.dbMigrationsProjectPath) {
    trace('dbMigrationsProjectPath is not set - returning false')
    return false
  }
  if (!fs.existsSync(config.dbMigrationsProjectPath)) {
    trace('dbMigrationsProjectPath is set but the path does not exist, returning false')
    return false
  }

  try {
    const files = await fsp.readdir(config.dbMigrationsProjectPath)
    if (files.some(file => path.extname(file) === '.csproj')) {
      trace('csproj file found, returning true')
      return true
    }
  } catch (err) {
    trace('error checking if dbMigrationsProjectPath contains a .csproj file', err)
    return false
  }
  trace('csproj file not found, returning false')
  return false
}

export function getDbContextCliKeys() {
  return config.dbContexts.map(context => context.cliKey)
}

export function getDbContextsForEfActionFromCliArgs(): DbContextConfig[] {
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

  // Only one arg passed and it's not one of the available CLI keys - assume it's the migration name and just return the defaults if none specified
  return contextsIfNotSpecified
}

export function getDbContextNamesForEfAction(): string[] {
  return getDbContextsForEfActionFromCliArgs().map(context => context.name)
}

export function getMigrationNameArg(): string | undefined {
  const migrationName = process.argv[4] || process.argv[3]
  // If only one arg is passed it can be the CLI key of the context to use instead of the migration name
  if (!process.argv[4] && (migrationName === 'all' || getDbContextCliKeys().includes(migrationName))) {
    return undefined
  }
  return migrationName && !getDbContextCliKeys().includes(migrationName) ? migrationName : undefined
}

export function logDbCommandMessage(prefix: string, dbContextNames: string[]) {
  log(`${prefix} using project path 📁${config.dbMigrationsProjectPath} and db context${dbContextNames.length > 1 ? 's' : ''}: ${dbContextNames.map(n => `➡️${n}`).join(', ')}`)
}

export function getDbContextsTraceString(contexts: DbContextConfig[]) {
  return contexts.map(context => '  ' + JSON.stringify(context)).join('\n')
}

export function getDbContextsForSetupFromCliArgs(): DbContextConfig[] {
  const firstArg = process.argv[3]
  const secondArg = process.argv[4]

  const contextsIfNotSpecified = config.dbContexts.filter(context => context.useWhenNoContextSpecified)

  if (!firstArg) {
    if (contextsIfNotSpecified.length === 0) {
      throw new Error(`If config does not have DbContexts with "useWhenNoContextSpecified" set to true, you must pass the name of the context(s) you would like to operate on`)
    }
    return contextsIfNotSpecified
  }

  if (firstArg && firstArg.toLowerCase() === 'all') {
    if (secondArg !== undefined) {
      throw new Error(`If passing "all" for DbContexts to use, no other parameters should be passed`)
    }
    return config.dbContexts
  }

  const allArgs = process.argv.slice(3)
  const dbContextsToOperateOn: DbContextConfig[] = []
  for (const arg of allArgs) {
    const argLower = arg.toLowerCase()
    const argWithoutDbContextSuffix = argLower.replace('dbcontext', '')
    const match = config.dbContexts.find(c => c.cliKey === arg || c.name.toLowerCase() === argLower || c.name.toLowerCase().replace('dbcontext', '') === argWithoutDbContextSuffix)
    if (match) {
      dbContextsToOperateOn.push(match)
    }
  }

  return dbContextsToOperateOn
}

export async function deleteScriptFileIfEmpty(scriptPath: string) {
  if (fs.existsSync(scriptPath)) {
    const scriptContents = fs.readFileSync(scriptPath, { encoding: 'utf8' })
    if (scriptContents.trim().length === 0) {
      await fsp.unlink(scriptPath)
    } else {
      log(`${Emoji.Warning} Skipping deletion of non-empty script file: ${scriptPath}`)
    }
  }
}

/**
 * Get the name of the last migration, or `null` if there aren't any.
 * @param projectPath Path to the DbMigrations C# Console app containing the migrations.
 * @param dbContextName The full name of the DbContext class.
 * @returns The name of the latest migration or `null` if there are none.
 */
export async function getLastMigrationName(projectPath: string, dbContextName: string): Promise<string | null> {
  const migrationsDirectory = getMigrationsDirectory(projectPath, dbContextName)
  const filenames = fs.readdirSync(migrationsDirectory)
  const migrationNames = filenames.filter(filename =>
    filename.endsWith('.cs') &&
    !filename.endsWith('.Designer.cs') &&
    !filename.endsWith('.ModelSnapshot.cs') &&
    filename.includes('_')).map(filename => filename.substring(0, filename.length - 3))
  const migrationNamesWithTimestamps = migrationNames.map(migrationName => {
    const timestamp = migrationName.substring(0, 14)
    const name = migrationName.substring(15)
    return { timestamp, name }
  })

  if (migrationNames.length === 0) {
    return null
  }

  log(`Found migrations: ${migrationNamesWithTimestamps.map(m => m.name).join(', ')}`)
  log(`Found timestamps: ${migrationNamesWithTimestamps.map(m => m.timestamp).join(', ')}`)
  const sortedMigrationNames = [...migrationNamesWithTimestamps].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const lastMigrationName = sortedMigrationNames[sortedMigrationNames.length - 1].name
  return lastMigrationName
}

export function getMigrationsProjectRelativePath(dbContextName: string) {
  return `Migrations/${dbContextName}Migrations`
}

function getMigrationsDirectory(projectDirectory: string, dbContextName: string) {
  return path.join(projectDirectory, `Migrations/${dbContextName}Migrations`)
}

export function getScriptPath(projectDirectory: string, migrationName: string, isUp: boolean, scriptsSubdirectory?: string) {
  const scriptPathPart = scriptsSubdirectory ? `${scriptsSubdirectory}/` : ''
  return path.join(projectDirectory, `Scripts/${scriptPathPart}${migrationName}${isUp ? '' : '_Down'}.sql`)
}

async function getCSharpMigrationFilePath(projectDirectory: string, dbContextName: string, migrationName: string) {
  const migrationsOutputDir = getMigrationsDirectory(projectDirectory, dbContextName)

  if (!fs.existsSync(migrationsOutputDir)) {
    throw new Error(`Unable to add migration C# boilerplate - could not find migrations output directory: ${migrationsOutputDir}`)
  }

  log(`Checking for generated C# file 📄XXXX_${migrationName}.cs in directory 📁${migrationsOutputDir}`)

  const filenamePattern = `_${migrationName}.cs`
  const filenames = fs.readdirSync(migrationsOutputDir).filter(filename => filename.endsWith(filenamePattern))
  if (!filenames || filenames.length === 0) {
    throw new Error(`Auto-generated migration file not found - migrations output directory has no C# files ending with : ${filenamePattern}`)
  }

  if (filenames.length > 1) {
    throw new Error(`Auto-generated migration file not found - migrations output directory has multiple C# files with the same migration name: ${filenames.join(', ')}`)
  }

  const filename = filenames[0]
  const filePath = path.join(migrationsOutputDir, filename)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Issue generating file path for migration (bad file path): ${filePath}`)
  }

  return filePath
}

export async function addDbMigrationBoilerplate(projectDirectory: string, dbContextName: string, migrationName: string, scriptsSubdirectory?: string) {
  const cSharpMigrationFilePath = await getCSharpMigrationFilePath(projectDirectory, dbContextName, migrationName)

  log(`Replacing file contents with boilerplate for file 📄${cSharpMigrationFilePath}`)

  const oldFileContents = await fsp.readFile(cSharpMigrationFilePath, { encoding: 'utf8' })
  const namespaceLine = oldFileContents.split('\n').find(line => line.startsWith('namespace '))?.trim()
  if (!namespaceLine) {
    throw new Error(`Unable to find namespace line in file: ${cSharpMigrationFilePath}`)
  }

  let newFileContents = cSharpMigrationFileTemplate
    .replaceAll(namespaceLinePlaceholder, namespaceLine)
    .replaceAll(contextNamePlaceholder, dbContextName)
    .replaceAll(migrationNamePlaceholder, migrationName)

  if (scriptsSubdirectory) {
    newFileContents = newFileContents.replaceAll(scriptsSubdirectoryPlaceholder, `${scriptsSubdirectory}/`)
  } else {
    newFileContents = newFileContents.replaceAll(scriptsSubdirectoryPlaceholder, '')
  }

  await fsp.writeFile(cSharpMigrationFilePath, newFileContents, { encoding: 'utf8' })

  log(`Updated file with boilerplate - please ensure it is correct: 📄${cSharpMigrationFilePath}`)

  const scriptsRelativeDir = `Scripts/${scriptsSubdirectory ? `${scriptsSubdirectory}/` : ''}`
  const scriptsDir = path.join(projectDirectory, scriptsRelativeDir)
  if (!fs.existsSync(scriptsDir)) {
    log(`creating missing scripts directory: ${scriptsDir}`)
    await mkdirp(scriptsDir)
  }
  const upScriptPath = path.join(projectDirectory, `${scriptsRelativeDir}${migrationName}.sql`)
  const downScriptPath = path.join(projectDirectory, `${scriptsRelativeDir}${migrationName}_Down.sql`)

  log('\nCreating corresponding empty sql files (no action will be taken if they already exist):')
  log(`  - 📄${upScriptPath}`)
  log(`  - 📄${downScriptPath}\n`)

  await writeEmptySqlFileIfNotExists(upScriptPath, 'Up')
  await writeEmptySqlFileIfNotExists(downScriptPath, 'Down')
}

async function writeEmptySqlFileIfNotExists(scriptPath: string, scriptType: 'Up' | 'Down') {
  if (!fs.existsSync(scriptPath)) {
    const filename = path.basename(scriptPath)
    await fsp.writeFile(scriptPath, `-- ${filename} - ${scriptType} script`, { encoding: 'utf8' })
  } else {
    log(`Skipping ${scriptType} sql script (already exists)`)
  }
}

const namespaceLinePlaceholder = '{{namespace}}'
const contextNamePlaceholder = '{{context_name}}'
const migrationNamePlaceholder = '{{migration_name}}'
const scriptsSubdirectoryPlaceholder = '{{scripts_subdirectory}}'
const cSharpMigrationFileTemplate = `using Microsoft.EntityFrameworkCore.Migrations;
using MikeyT.DbMigrations;

#nullable disable

{{namespace}}
{
    public partial class ${migrationNamePlaceholder} : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            MigrationScriptRunner.RunScript(migrationBuilder, "${scriptsSubdirectoryPlaceholder}${migrationNamePlaceholder}.sql");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            MigrationScriptRunner.RunScript(migrationBuilder, "${scriptsSubdirectoryPlaceholder}${migrationNamePlaceholder}_Down.sql");
        }
    }
}
`
