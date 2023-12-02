import { Emoji, log, mkdirp, spawnAsync } from '@mikeyt23/node-cli-utils'
import { cyan } from '@mikeyt23/node-cli-utils/colors'
import { ensureDotnetTool, isSdkMajorVersionInstalled, sdkVersionToTfm } from '@mikeyt23/node-cli-utils/dotnetUtils'
import fs from 'node:fs'
import fsp, { readdir } from 'node:fs/promises'
import path, { extname } from 'node:path'
import config from '../../config/singleton/EntityFrameworkConfigSingleton.js'
import { getRequiredSwigTaskCliParam } from '../../utils/swigCliModuleUtils.js'
import { migratorProjectExists, throwIfConfigInvalid } from './EntityFrameworkInternal.js'

export async function dbBootstrapMigrationsProject() {
  const projectPath = config.dbMigrationsProjectPath!

  if (await migratorProjectExists()) {
    logWithPrefix(`${Emoji.Info} DbMigrations project appears to already exist (${config.dbMigrationsProjectPath}) - exiting`)
    return
  }

  await validateBeforeBootstrap()

  logWithPrefix('ensuring dotnet-ef tool is installed')
  await ensureDotnetTool('dotnet-ef', { dotnetMajorVersion: config.dotnetSdkVersion })

  const tfm = sdkVersionToTfm(config.dotnetSdkVersion)

  logWithPrefix(`using dotnet sdk version ${config.dotnetSdkVersion} (TFM: ${tfm})`)

  const frameworkVersionArgs = ['-f', tfm]

  logWithPrefix(`spawning dotnet command to create new console app at ${projectPath}...`)
  await spawnAsync('dotnet', ['new', 'console', '-o', projectPath, ...frameworkVersionArgs], { throwOnNonZero: true })

  const dbMigrationsPackageName = 'MikeyT.DbMigrations'
  logWithPrefix(`adding package MikeyT.DbMigrations`)
  await spawnAsync('dotnet', ['add', 'package', dbMigrationsPackageName], { cwd: projectPath, throwOnNonZero: true })

  const efDesignPackageName = 'Microsoft.EntityFrameworkCore.Design'
  logWithPrefix(`determining which version of ${efDesignPackageName} is compatible by analyzing the new project's transitive dependencies`)
  const transitiveDependenciesResult = await spawnAsync('dotnet', ['list', 'package', '--include-transitive', '--format', 'json'], { stdio: 'pipe', cwd: projectPath, throwOnNonZero: true })
  const transitiveDependenciesJson = JSON.parse(transitiveDependenciesResult.stdout)
  const efCoreVersion = transitiveDependenciesJson?.projects[0]?.frameworks[0]?.transitivePackages?.find((p: { id: string, resolvedVersion: string }) => p.id === 'Microsoft.EntityFrameworkCore')?.resolvedVersion
  if (!efCoreVersion) {
    throw new Error(`Could not determine the ${efDesignPackageName} to use based on the transitive dependency output: ${transitiveDependenciesResult.stdout}`)
  }
  const efDesignMajorVersion = efCoreVersion.split('.')[0]
  logWithPrefix(`adding package ${efDesignPackageName} version ${efDesignMajorVersion}`)
  await spawnAsync('dotnet', ['add', 'package', efDesignPackageName, '-v', `${efDesignMajorVersion}`], { cwd: projectPath })

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
      await spawnAsync('dotnet', ['run', '--', 'bootstrap', ctx.name, dbSetupType], { cwd: projectPath, throwOnNonZero: true })
    }
  } else {
    logWithPrefix(`no DbContext entries in the provided config specified the "dbSetupType" and will not be setup automatically - you can bootstrap these yourself using the generated console app's "bootstrap" command`)
  }

  logBootstrapFinishedMessage()
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
  throwIfConfigInvalid(false, false)
  logWithPrefix(`verifying existence of dotnet ${config.dotnetSdkVersion}...`)
  if (!await isSdkMajorVersionInstalled(config.dotnetSdkVersion)) {
    logWithPrefix(`${Emoji.Stop} The necessary version of the dotnet SDK (${config.dotnetSdkVersion}) does not appear to be installed - exiting`)
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

function logBootstrapFinishedMessage() {
  log(`${Emoji.Info} Next steps:`)
  log(`  - Enable docker swig commands by re-exporting tasks in your swigfile: export * from 'swig-cli-modules/DockerCompose'`)
  log(`  - Ensure you have a .env with the appropriate values`)
  log(`  - Start docker: swig dockerUp`)
  log(`  - Copy your .env to the new DB migrations project directory`)
  log(`  - Initialize your databases and users: swig dbSetup`)
  log(`  - Create an initial migration:`)
  log(`    - swig dbAddMigration all Initial`)
  log(`    - swig dbMigrate all`)
}
