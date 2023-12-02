// Project url: https://github.com/mikey-t/dotnet-react-sandbox

import * as nodeCliUtils from '@mikeyt23/node-cli-utils'
import { conditionallyAsync, log } from '@mikeyt23/node-cli-utils'
import { StringBoolArray } from '@mikeyt23/node-cli-utils/DependencyChecker'
import * as certUtils from '@mikeyt23/node-cli-utils/certUtils'
import { deleteDockerComposeVolume } from '@mikeyt23/node-cli-utils/dockerUtils'
import * as dotnetUtils from '@mikeyt23/node-cli-utils/dotnetUtils'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parallel, series } from 'swig-cli'
import config from '../../config/singleton/DotnetReactSandboxConfigSingleton.js'
import { getRequiredSwigTaskCliParam } from '../../utils/swigCliModuleUtils.js'
import * as swigDocker from '../DockerCompose/DockerCompose.js'
import * as swigEf from '../EntityFramework/EntityFramework.js'
import * as swigEfUtil from '../EntityFramework/EntityFrameworkUtils.js'

export const setup = series(
  syncEnvFiles,
  checkDependenciesForSetup,
  setupCert,
  setupHostsEntry,
  ['dockerUp', () => conditionallyAsync(!config.nodb, swigDocker.dockerUp)],
  ['dbInitialCreate', () => conditionallyAsync(
    !config.nodb,
    () => nodeCliUtils.withRetryAsync(() => dbMigratorCliCommand('dbInitialCreate'), 5, 3000, { initialDelayMilliseconds: 10000, functionLabel: 'dbInitialCreate' }))
  ],
  ['dbMigrate', () => conditionallyAsync(!config.nodb, () => swigEfUtil.executeEfAction('update', ['main', 'test']))]
)

export const setupStatus = series(
  syncEnvFiles,
  reportSetupStatus
)

export const teardown = series(
  syncEnvFiles,
  checkDependenciesForTeardown,
  teardownCert,
  teardownHostsEntry,
  teardownDb
)

export const server = series(syncEnvFiles, runServer)
export const client = series(syncEnvFiles, runClient)

export const testServer = series(syncEnvFiles, doTestServer)

export const buildClient = series(syncEnvFiles, doBuildClient)
export const copyClientBuildOnly = doCopyClientBuild
export const buildServer = series(syncEnvFiles, doBuildServer)
export const createDbMigratorRelease = series(parallel(syncEnvFiles, ensureReleaseDir), doCreateDbMigratorRelease)
export const buildAll = series(parallel(syncEnvFiles, ensureReleaseDir), parallel(doBuildClient, doBuildServer), doCopyClientBuild)

export const runBuilt = series(syncEnvFiles, doRunBuilt)

export const createRelease = parallel(series(buildAll, createReleaseTarball), doCreateDbMigratorRelease)
export const createReleaseTarballOnly = createReleaseTarball

export const dockerUp = series(syncEnvFiles, ['dockerUp', swigDocker.dockerUp])
export const dockerUpAttached = series(syncEnvFiles, ['dockerDown', swigDocker.dockerDown], ['dockerUpAttached', swigDocker.dockerUpAttached])
export const dockerDown = series(syncEnvFiles, ['dockerUp', swigDocker.dockerDown])

export const dbInitialCreate = series(syncEnvFiles, ['dbInitialCreate', () => dbMigratorCliCommand('dbInitialCreate')])
export const dbDropAll = series(syncEnvFiles, ['dbDropAll', () => dbMigratorCliCommand('dbDropAll')])
export const dbDropAndRecreate = series(syncEnvFiles, ['dbDropAndRecreate', () => dbMigratorCliCommand('dbDropAndRecreate')])

export const dbListMigrations = series(syncEnvFiles, swigEf.dbListMigrations)
export const dbMigrate = series(syncEnvFiles, swigEf.dbMigrate)
export const dbAddMigration = series(syncEnvFiles, swigEf.dbAddMigration)
export const dbRemoveMigration = series(syncEnvFiles, swigEf.dbRemoveMigration)

export const bashIntoDb = series(syncEnvFiles, ['bashIntoContainer', () => swigDocker.bashIntoContainer(config.dbContainerName)])

export const configureDotnetDevCerts = dotnetUtils.configureDotnetDevCerts

export async function deleteBuildAndRelease() {
  const dirs = ['./build', './release']
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      await fsp.rm(dir, { recursive: true })
    }
  }
}

// The syncEnvFiles method copies any new values from .env.template to .env and then copies .env to all directories in directoriesWithEnv array.
// Values added directly to .env files in directoriesWithEnv will not be overwritten, but this is not recommended.
// Instead, use your root .env file as the source of truth and never directly modify the others unless it's temporary.
//
// Use additional arg 'clean' to delete all the non-root .env copies before making new copies - useful for removing values that are no longer in the root .env file.
export async function syncEnvFiles() {
  const rootEnvPath = './.env'
  if (process.argv[3] && process.argv[3] === 'clean') {
    log(`syncEnvFiles called with 'clean' arg - deleting .env copies`)
    await deleteEnvCopies()
  }

  await nodeCliUtils.copyNewEnvValues(`${rootEnvPath}.template`, rootEnvPath)

  // Load env vars from root .env file into process.env in case this is the first run or if there are new vars copied over from .env.template.
  config.loadEnvFunction()

  await nodeCliUtils.ensureDirectory(config.buildWwwrootDir)
  for (const dir of config.directoriesWithEnv) {
    await nodeCliUtils.overwriteEnvFile(rootEnvPath, path.join(dir, '.env'), dir === config.serverTestPath)
  }
  await nodeCliUtils.copyModifiedEnv(
    rootEnvPath,
    `${config.serverTestPath}/.env`,
    ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'],
    { 'DB_NAME': `test_${process.env.DB_NAME || 'DB_NAME_MISSING_FROM_PROCESS_ENV'}` }
  )
}

export async function deleteEnvCopies() {
  for (const dir of config.directoriesWithEnv) {
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(envPath)) {
      log('deleting .env file at path', envPath)
      await nodeCliUtils.deleteEnvIfExists(envPath)
    }
  }
}

export async function generateCert() {
  const url = getRequiredSwigTaskCliParam(0, 'Missing param to be used for cert url. Example: swig generateCert local.acme.com')
  await certUtils.generateCertWithOpenSsl(url)
}

export async function winInstallCert() {
  const url = getRequiredSwigTaskCliParam(0, 'Missing param to be used for cert url. Example: swig winInstallCert local.acme.com')
  let certPath = path.join('./cert/', `${url}.pfx`)
  if (fs.existsSync(certPath)) {
    log(`using cert file at path ${certPath}`)
  } else {
    log(`cert does not exist at path ${certPath}, generating...`)
    certPath = await certUtils.generateCertWithOpenSsl(url)
  }
  log(`attempting to install cert: ${certPath}`)
  await certUtils.winInstallCert(certPath)
}

export async function winUninstallCert() {
  const certSubject = getRequiredSwigTaskCliParam(0, 'Missing param to be used for cert url. Example: swig winUninstallCert local.acme.com')
  await certUtils.winUninstallCert(certSubject)
}

export async function linuxInstallCert() {
  certUtils.linuxInstallCert() // This doesn't actually install anything - it just dumps out instructions for how to do it manually...
}

export async function showConfig() {
  console.log(JSON.stringify(config, null, 2))
}

export const lint = parallel(lintRoot, lintClient)

// End exported functions //
//**************************
// Start helper functions //

async function runServer() {
  const command = 'dotnet'
  const args = ['watch', '--project', config.serverCsprojPath]
  await nodeCliUtils.spawnAsyncLongRunning(command, args)
}

async function runClient() {
  const command = 'node'
  const args = ['./node_modules/vite/bin/vite.js', 'dev']
  await nodeCliUtils.spawnAsyncLongRunning(command, args, config.clientPath)
}

async function doTestServer() {
  await nodeCliUtils.spawnAsyncLongRunning('dotnet', ['test'], config.serverTestPath)
}

async function doBuildClient() {
  await nodeCliUtils.spawnAsync('npm', ['run', 'build', '--omit=dev'], { cwd: config.clientPath })
}

async function doBuildServer() {
  log('emptying build directory')
  await nodeCliUtils.emptyDirectory(config.buildDir, { fileAndDirectoryNamesToSkip: ['wwwroot'] })
  log('building server')
  await dotnetUtils.dotnetPublish(config.serverCsprojPath, 'Release', config.buildDir)
}

async function ensureReleaseDir() {
  await nodeCliUtils.ensureDirectory(config.releaseDir)
}

async function doBuildDbMigrator() {
  const publishDir = path.join(config.dbMigratorPath, 'publish')
  await dotnetUtils.dotnetPublish(config.dbMigratorPath, 'Release', publishDir)
  await nodeCliUtils.deleteEnvIfExists(path.join(publishDir, '.env'))
  return publishDir
}

async function doCreateDbMigratorRelease() {
  const publishDir = await doBuildDbMigrator()
  const tarballPath = path.join(config.releaseDir, config.dbMigratorTarballName)
  if (fs.existsSync(tarballPath)) {
    log(`deleting existing tarball before re-creating: ${tarballPath}`)
    await fsp.unlink(tarballPath)
  }
  await nodeCliUtils.createTarball(publishDir, path.join(config.releaseDir, config.dbMigratorTarballName), { excludes: ['.env'] })
}

async function doCopyClientBuild() {
  await nodeCliUtils.copyDirectoryContents(path.join(config.clientPath, 'dist'), config.buildWwwrootDir)
}

async function createReleaseTarball() {
  const tarballPath = path.join(config.releaseDir, config.releaseTarballName)
  if (fs.existsSync(tarballPath)) {
    log(`deleting existing tarball before re-creating: ${tarballPath}`)
    await fsp.unlink(tarballPath)
  }
  await nodeCliUtils.createTarball(config.buildDir, path.join(config.releaseDir, config.releaseTarballName), { excludes: ['.env'] })
}

type DbMigratorCommand = 'dbInitialCreate' | 'dbDropAll' | 'dbDropAndRecreate'

async function dbMigratorCliCommand(command: DbMigratorCommand) {
  if (command === 'dbInitialCreate') {
    const result = await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', config.dbMigratorPath, 'dbInitialCreate'])
    if (result.code !== 0) {
      throw new Error(`dbInitialCreate failed with exit code ${result.code}`)
    }
    return
  }
  if (command === 'dbDropAll' && await nodeCliUtils.getConfirmation('Are you sure you want to drop main and test databases and database user?')) {
    await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', config.dbMigratorPath, 'dbDropAll'], { throwOnNonZero: true })
    return
  }
  if (command === 'dbDropAndRecreate') {
    if (!await nodeCliUtils.getConfirmation('Are you sure you want to drop main and test databases and database user?')) {
      return
    } else {
      await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', config.dbMigratorPath, 'dbDropAll'], { throwOnNonZero: true })
      await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', config.dbMigratorPath, 'dbInitialCreate'], { throwOnNonZero: true })
      return
    }
  }
  throw new Error(`Unknown DbMigrator command: ${command}`)
}

async function doRunBuilt() {
  const buildEnvPath = path.join(config.buildDir, '.env')
  await fsp.writeFile(buildEnvPath, '\nASPNETCORE_ENVIRONMENT=Production', { flag: 'a' })
  await fsp.writeFile(buildEnvPath, `\nPRE_DEPLOY_HTTP_PORT=${config.preDeployHttpPort}`, { flag: 'a' })
  await fsp.writeFile(buildEnvPath, `\nPRE_DEPLOY_HTTPS_PORT=${config.preDeployHttpsPort}`, { flag: 'a' })
  const siteUrl = nodeCliUtils.getRequiredEnvVar('SITE_URL')
  const devCertName = `${siteUrl}.pfx`
  const certSourcePath = path.join('./cert/', devCertName)
  const certDestinationPath = path.join(config.buildDir, devCertName)
  await fsp.copyFile(certSourcePath, certDestinationPath)
  await nodeCliUtils.spawnAsyncLongRunning('dotnet', ['WebServer.dll', '--launch-profile', '"PreDeploy"'], './build/')
}

async function checkDependenciesForSetup() {
  const depsChecker = config.dependencyChecker
  let report = await depsChecker.getReport()
  if (config.nodb) {
    report = report.filter(({ key }) => key !== 'DB_PORT is available')
  }
  log(depsChecker.getFormattedReport(report))
  const depsCheckPassed = depsChecker.hasAllDependencies(report)
  log(`Dependencies check passed: ${depsCheckPassed ? 'true' : 'false'}\n`,)
  if (!depsCheckPassed) {
    throw Error('dependencies check failed - see above')
  }
}

async function reportSetupStatus() {
  const depsChecker = config.dependencyChecker
  const dependenciesReport = await depsChecker.getReport()
  log('Checking dependencies:')
  log(depsChecker.getFormattedReport(dependenciesReport, true, ['Elevated Permissions', 'DB_PORT is available', 'DEV_CLIENT_PORT is available', 'DEV_SERVER_PORT is available']))

  log('Checking cert and hosts setup:')
  const hostname = nodeCliUtils.getHostname(config.siteUrl)
  const certFileStatus = { key: 'Cert file exists', value: fs.existsSync(`./cert/${hostname}.pfx`) }
  const certInstalledStatus = { key: 'Cert installed', value: await certUtils.winCertIsInstalled(hostname) }
  const hostsStatus = { key: 'Hosts entry exists', value: await nodeCliUtils.hostsFileHasEntry(config.siteUrl) }
  const othersReport: StringBoolArray = [certFileStatus, certInstalledStatus, hostsStatus]
  log(depsChecker.getFormattedReport(othersReport))
}

async function setupCert() {
  await config.projectSetupUtil.ensureCertSetup(config.siteUrl)
}

async function setupHostsEntry() {
  await nodeCliUtils.ensureHostsEntry(config.siteUrl)
}

async function checkDependenciesForTeardown() {
  if (!await config.dependencyChecker.hasElevatedPermissions()) {
    throw new Error('Elevated permissions are required to run teardown')
  }
}

async function teardownCert() {
  await config.projectSetupUtil.teardownCertSetup(config.siteUrl)
}

async function teardownHostsEntry() {
  await nodeCliUtils.removeHostsEntry(config.siteUrl)
}

async function teardownDb() {
  if (config.nodb) {
    log('"nodb" option recognized - skipping DB teardown')
    return
  }
  if (!await nodeCliUtils.getConfirmation(`Do you want to completely destroy your database permanently? ${nodeCliUtils.Emoji.Scull}`)) {
    return
  }

  await swigDocker.dockerDown()

  // Older versions used a bind mount located at ./docker/pg - delete it if it exists there
  if (fs.existsSync('./docker/pg')) {
    await nodeCliUtils.emptyDirectory('docker/pg')
  }

  // Newer versions use a docker volume
  await deleteDockerComposeVolume('postgresql_data')
}

async function lintRoot() {
  await nodeCliUtils.spawnAsync('node', [config.eslintPath, './swigfile.ts'], { throwOnNonZero: true })
}

async function lintClient() {
  await nodeCliUtils.spawnAsync('node', [config.eslintPath, '--ext', '.ts,.tsx', 'src/'], { throwOnNonZero: true, cwd: './client' })
}
