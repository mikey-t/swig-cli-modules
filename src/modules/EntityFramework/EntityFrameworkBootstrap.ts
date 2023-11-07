import { Emoji, isChildPath, log, mkdirp, spawnAsync } from '@mikeyt23/node-cli-utils'
import { hasDotnetSdkGreaterThanOrEqualTo } from '@mikeyt23/node-cli-utils/DependencyChecker'
import { cyan } from '@mikeyt23/node-cli-utils/colors'
import { getLatestNugetPackageVersion } from '@mikeyt23/node-cli-utils/dotnetUtils'
import fs from 'node:fs'
import fsp, { readdir } from 'node:fs/promises'
import path, { extname } from 'node:path'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import { getRequiredSwigTaskCliParam } from '../../utils/swigCliModuleUtils.js'
import { migratorProjectExists, throwIfConfigInvalid } from './EntityFrameworkInternal.js'

const minDotnetVersion = 6

export async function dbBootstrapMigrationsProject() {
  const projectPath = config.dbMigrationsProjectPath!

  if (await migratorProjectExists()) {
    logWithPrefix(`${Emoji.Info} DbMigrations project appears to already exist (${config.dbMigrationsProjectPath}) - exiting`)
    return
  }

  await validateBeforeBootstrap()

  // Note the specific use of dotnet 6 here. In the future this will probably need to support
  // multiple versions once the db-migrations-dotnet project supports multiple dotnet versions.
  const net6 = 'net6.0'
  const frameworkVersionArgs = ['-f', net6]

  logWithPrefix(`spawning dotnet command to create new console app at ${projectPath}...`)
  await spawnAsync('dotnet', ['new', 'console', '-o', projectPath, ...frameworkVersionArgs])

  // Add dependency references
  const efDesignPackageName = 'Microsoft.EntityFrameworkCore.Design'
  const dbMigrationsPackageName = 'MikeyT.DbMigrations'
  logWithPrefix(`attempting to get version numbers for dependencies (latest version that supports the correct .net framework version)`)
  const efDesignVersion = await getLatestNugetPackageVersion(efDesignPackageName, net6)
  if (efDesignVersion == null) {
    throw new Error(`Could not determine latest supported version of package ${efDesignPackageName}`)
  }
  logWithPrefix(`using version ${efDesignVersion} for ${efDesignPackageName}`)
  const dbMigrationsVersion = await getLatestNugetPackageVersion(dbMigrationsPackageName, net6)
  if (dbMigrationsVersion == null) {
    throw new Error(`Could not determine latest supported version of package ${efDesignPackageName}`)
  }
  logWithPrefix(`using version ${dbMigrationsVersion} for ${dbMigrationsPackageName}`)
  logWithPrefix(`spawning dotnet commands to add references`)
  await spawnAsync('dotnet', ['add', 'package', efDesignPackageName, '-v', efDesignVersion], { cwd: projectPath })
  await spawnAsync('dotnet', ['add', 'package', dbMigrationsPackageName, '-v', dbMigrationsVersion], { cwd: projectPath })

  const scriptsDir = path.join(projectPath, 'Scripts')
  await mkdirp(path.join(projectPath, 'Migrations'))
  await mkdirp(scriptsDir)

  for (const context of config.dbContexts) {
    if (context.scriptsSubdirectory) {
      await mkdirp(path.join(scriptsDir, context.scriptsSubdirectory))
    }
  }

  await updateBootstrappedCsproj()
  await updateBootstrappedProgramFile()

  await tryAddingSolutionReference(projectPath)

  const dbContextsWithDbSetupType = config.dbContexts.filter(c => c.dbSetupType !== undefined && c.dbSetupType.trim() !== '')
  if (dbContextsWithDbSetupType.length > 0) {
    logWithPrefix(`attempting to run the new console app's "bootstrap" command for each DbContext in the EF configuration provided`)
    for (const ctx of dbContextsWithDbSetupType) {
      const dbSetupType = ctx.dbSetupType!.trim()
      logWithPrefix(`running: dotnet run -- bootstrap ${ctx.name} ${dbSetupType}`)
      await spawnAsync('dotnet', ['run', '--', 'bootstrap', ctx.name, dbSetupType], { cwd: projectPath })
    }
  } else {
    logWithPrefix(`no DbContext entries in the provided config specified the "dbSetupType" and will not be setup automatically - you can bootstrap these yourself using the generated console app's "bootstrap" command`)
  }

  log(`${Emoji.Info} Reminder: ensure your new project has a .env file if necessary`)
}

export async function dbBootstrapDbContext() {
  const contextName = getRequiredSwigTaskCliParam(0, 'Missing first required param for the DbContext name (for example: ExampleDbContext)')
  const dbSetupTypeName = getRequiredSwigTaskCliParam(1, 'Missing second required param for the name of the DbSetup type (for example: PostgresSetup)')

  throwIfConfigInvalid(false)

  await spawnAsync('dotnet', ['run', '--', 'bootstrap', contextName, dbSetupTypeName], { cwd: config.dbMigrationsProjectPath, throwOnNonZero: true })

  log(`\n${Emoji.Info} Reminder: update your swigfile with a new entry in the EntityFrameworkConfig init method's "dbContexts" param. Example DbContextConfig to add:\n`)
  log(getExampleDbContextConfig(contextName, dbSetupTypeName) + '\n')
}

function getExampleDbContextConfig(contextName: string, dbSetupTypeName: string): string {
  const exampleCliKey = contextName.toLowerCase().replace('dbcontext', '')
  return `{ name: '${contextName}', cliKey: '${exampleCliKey}', dbSetupType: '${dbSetupTypeName}', useWhenNoContextSpecified: true }`
}

function logWithPrefix(message: string) {
  log(`[${cyan('bootstrap')}] ${message}`)
}

async function validateBeforeBootstrap() {
  if (!config.dbMigrationsProjectPath) {
    throw new Error(`The config dbMigrationsProjectPath was not set`)
  }

  if (!isChildPath(process.cwd(), config.dbMigrationsProjectPath)) {
    throw new Error(`The config dbMigrationsProjectPath (${config.dbMigrationsProjectPath}) must be a child path of the current working directory`)
  }

  logWithPrefix(`verifying existence of dotnet >= ${minDotnetVersion}...`)
  if (!await hasDotnetSdkGreaterThanOrEqualTo(minDotnetVersion)) {
    logWithPrefix(`${Emoji.Stop} The necessary version of the dotnet SDK (${minDotnetVersion}) does not appear to be installed - exiting`)
    return
  }
  logWithPrefix(`${Emoji.GreenCheck} a valid version of the dotnet sdk appears to be installed`)

  logWithPrefix(`DbMigrator project name: ${config.dbMigrationsProjectName}`)
}

async function updateBootstrappedProgramFile() {
  const programPath = path.join(config.dbMigrationsProjectPath!, 'Program.cs')

  if (!fs.existsSync(programPath)) {
    throw new Error(`Could not find Program.cs at "${programPath}"`)
  }

  const programContents = await fsp.readFile(programPath, 'utf-8')

  if (programContents.includes('DbMigratorCli')) {
    logWithPrefix(`the contents of the Program.cs file appears to already have the bootstrapped contents - skipping`)
    return
  }

  const newContents = 'return await new MikeyT.DbMigrations.DbSetupCli().Run(args);'

  await fsp.writeFile(programPath, newContents)
}

async function updateBootstrappedCsproj() {
  const csprojPath = path.join(config.dbMigrationsProjectPath!, `${config.dbMigrationsProjectName}.csproj`)

  const csprojContent = await fsp.readFile(csprojPath, 'utf8')

  if (csprojContent.includes('Folder Include="Migrations')) {
    logWithPrefix(`detected that the csproj file already has the added sections - skipping`)
    return
  }

  if (!fs.existsSync(csprojPath)) {
    throw new Error(`Cannot update bootstrapped csproj file - path not found: ${csprojPath}`)
  }

  logWithPrefix(`attempting to update csproj file at ${csprojPath}...`)

  const itemGroupClosingTag = '</ItemGroup>'

  const lastItemGroupIndex = csprojContent.lastIndexOf(itemGroupClosingTag)
  if (lastItemGroupIndex === -1) {
    throw new Error(`Could not find last ItemGroup closing tag in csproj file at ${csprojPath}`)
  }
  const startIndex = lastItemGroupIndex + itemGroupClosingTag.length
  const newCsprojContent = csprojContent.slice(0, startIndex) + dbMigrationsCsprojAddition + csprojContent.slice(startIndex)

  await fsp.writeFile(csprojPath, newCsprojContent)
}

async function tryAddingSolutionReference(projectPath: string) {
  const files = await readdir(process.cwd())
  const slnFiles = files.filter(file => extname(file) === '.sln')

  if (slnFiles.length !== 1) {
    logWithPrefix(`${Emoji.Info} be sure to add a reference to the new project in your sln file ("dotnet sln add <project_path>")`)
    return
  }

  logWithPrefix('adding sln reference to the new project')
  await spawnAsync('dotnet', ['sln', 'add', projectPath])
}

const dbMigrationsCsprojAddition = `\n\n  <ItemGroup>
    <None Update=".env" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
  <ItemGroup>
    <Content Include="Scripts/**" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>`
