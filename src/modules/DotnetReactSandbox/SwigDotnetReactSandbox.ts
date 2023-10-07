// Project url: https://github.com/mikey-t/dotnet-react-sandbox

import * as nodeCliUtils from '@mikeyt23/node-cli-utils'
import { log } from '@mikeyt23/node-cli-utils'
import { StringBoolArray } from '@mikeyt23/node-cli-utils/DependencyChecker'
import * as certUtils from '@mikeyt23/node-cli-utils/certUtils'
import * as dotnetUtils from '@mikeyt23/node-cli-utils/dotnetUtils'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parallel, series } from 'swig-cli'
import * as swigEf from '../EntityFramework/SwigEntityFramework.js'
import efConfig from '../../config/SwigEntityFrameworkConfig.js'
import swigDockerConfig from '../../config/SwigDockerComposeConfig.js'
import drsConfig from '../../config/SwigDotnetReactSandboxConfig.js'
import { conditionally, getRequireSecondParam } from '../../utils/generalUtils.js'
import * as swigDocker from '../DockerCompose/SwigDockerCompose.js'

// Setup swig cli module DockerCompose
swigDockerConfig.dockerComposePath = drsConfig.dockerComposePath

// Setup swig cli module EntityFramework
efConfig.init(
  drsConfig.dbMigratorPath,
  [
    { name: 'MainDbContext', cliKey: 'main', useWhenNoContextSpecified: true },
    { name: 'TestDbContext', cliKey: 'test' }
  ]
)

export const setup = series(
  syncEnvFiles,
  checkDependenciesForSetup,
  setupCert,
  setupHostsEntry,
  ['dockerUp', () => conditionally(!drsConfig.getNoDbVal(), swigDocker.dockerUp)],
  ['dbInitialCreate', () => conditionally(
    !drsConfig.getNoDbVal(),
    () => nodeCliUtils.withRetryAsync(() => dbMigratorCliCommand('dbInitialCreate'), 5, 3000, { initialDelayMilliseconds: 10000, functionLabel: 'dbInitialCreate' }))
  ],
  ['dbMigrate', () => conditionally(!drsConfig.getNoDbVal(), () => swigEf.executeEfAction('update', ['main', 'test']))]
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

export const dbListMigrations = series(syncEnvFiles, swigEf.listMigrations)
export const dbMigrate = series(syncEnvFiles, swigEf.dbMigrate)
export const dbAddMigration = series(syncEnvFiles, swigEf.addMigration)
export const dbRemoveMigration = series(syncEnvFiles, swigEf.removeMigration)

export const bashIntoDb = series(syncEnvFiles, ['bashIntoContainer', () => swigDocker.bashIntoContainer(drsConfig.dbContainerName)])

export const installOrUpdateDotnetEfTool = dotnetUtils.installOrUpdateDotnetEfTool
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
  drsConfig.loadEnvFunction()

  await nodeCliUtils.ensureDirectory(drsConfig.buildWwwrootDir)
  for (const dir of drsConfig.directoriesWithEnv) {
    await nodeCliUtils.overwriteEnvFile(rootEnvPath, path.join(dir, '.env'), dir === drsConfig.serverTestPath)
  }
  await nodeCliUtils.copyModifiedEnv(
    rootEnvPath,
    `${drsConfig.serverTestPath}/.env`,
    ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'],
    { 'DB_NAME': `test_${process.env.DB_NAME || 'DB_NAME_MISSING_FROM_PROCESS_ENV'}` }
  )
}

export async function deleteEnvCopies() {
  for (const dir of drsConfig.directoriesWithEnv) {
    const envPath = path.join(dir, '.env')
    if (fs.existsSync(envPath)) {
      log('deleting .env file at path', envPath)
      await nodeCliUtils.deleteEnvIfExists(envPath)
    }
  }
}

export async function generateCert() {
  const url = getRequireSecondParam('Missing param to be used for cert url. Example: swig generateCert local.acme.com')
  await certUtils.generateCertWithOpenSsl(url)
}

export async function winInstallCert() {
  const url = getRequireSecondParam('Missing param to be used for cert url. Example: swig winInstallCert local.acme.com')
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
  const certSubject = getRequireSecondParam('Missing param to be used for cert url. Example: swig winUninstallCert local.acme.com')
  await certUtils.winUninstallCert(certSubject)
}

export async function linuxInstallCert() {
  certUtils.linuxInstallCert() // This doesn't actually install anything - it just dumps out instructions for how to do it manually...
}

// End exported functions //
//**************************
// Start helper functions //

async function runServer() {
  const command = 'dotnet'
  const args = ['watch', '--project', drsConfig.serverCsprojPath]
  await nodeCliUtils.spawnAsyncLongRunning(command, args)
}

async function runClient() {
  const command = 'node'
  const args = ['./node_modules/vite/bin/vite.js', 'dev']
  await nodeCliUtils.spawnAsyncLongRunning(command, args, drsConfig.clientPath)
}

async function doTestServer() {
  await nodeCliUtils.spawnAsyncLongRunning('dotnet', ['test'], drsConfig.serverTestPath)
}

async function doBuildClient() {
  await nodeCliUtils.spawnAsync('npm', ['run', 'build', '--omit=dev'], { cwd: drsConfig.clientPath })
}

async function doBuildServer() {
  log('emptying build directory')
  await nodeCliUtils.emptyDirectory(drsConfig.buildDir, { fileAndDirectoryNamesToSkip: ['wwwroot'] })
  log('building server')
  await dotnetUtils.dotnetPublish(drsConfig.serverCsprojPath, 'Release', drsConfig.buildDir)
}

async function ensureReleaseDir() {
  await nodeCliUtils.ensureDirectory(drsConfig.releaseDir)
}

async function doBuildDbMigrator() {
  const publishDir = path.join(drsConfig.dbMigratorPath, 'publish')
  await dotnetUtils.dotnetPublish(drsConfig.dbMigratorPath, 'Release', publishDir)
  await nodeCliUtils.deleteEnvIfExists(path.join(publishDir, '.env'))
  return publishDir
}

async function doCreateDbMigratorRelease() {
  const publishDir = await doBuildDbMigrator()
  const tarballPath = path.join(drsConfig.releaseDir, drsConfig.dbMigratorTarballName)
  if (fs.existsSync(tarballPath)) {
    log(`deleting existing tarball before re-creating: ${tarballPath}`)
    await fsp.unlink(tarballPath)
  }
  await nodeCliUtils.createTarball(publishDir, path.join(drsConfig.releaseDir, drsConfig.dbMigratorTarballName), { excludes: ['.env'] })
}

async function doCopyClientBuild() {
  await nodeCliUtils.copyDirectoryContents(path.join(drsConfig.clientPath, 'dist'), drsConfig.buildWwwrootDir)
}

async function createReleaseTarball() {
  const tarballPath = path.join(drsConfig.releaseDir, drsConfig.releaseTarballName)
  if (fs.existsSync(tarballPath)) {
    log(`deleting existing tarball before re-creating: ${tarballPath}`)
    await fsp.unlink(tarballPath)
  }
  await nodeCliUtils.createTarball(drsConfig.buildDir, path.join(drsConfig.releaseDir, drsConfig.releaseTarballName), { excludes: ['.env'] })
}

type DbMigratorCommand = 'dbInitialCreate' | 'dbDropAll' | 'dbDropAndRecreate'

async function dbMigratorCliCommand(command: DbMigratorCommand) {
  if (command === 'dbInitialCreate') {
    const result = await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', drsConfig.dbMigratorPath, 'dbInitialCreate'])
    if (result.code !== 0) {
      throw new Error(`dbInitialCreate failed with exit code ${result.code}`)
    }
    return
  }
  if (command === 'dbDropAll' && await nodeCliUtils.getConfirmation('Are you sure you want to drop main and test databases and database user?')) {
    await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', drsConfig.dbMigratorPath, 'dbDropAll'], { throwOnNonZero: true })
    return
  }
  if (command === 'dbDropAndRecreate') {
    if (!await nodeCliUtils.getConfirmation('Are you sure you want to drop main and test databases and database user?')) {
      return
    } else {
      await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', drsConfig.dbMigratorPath, 'dbDropAll'], { throwOnNonZero: true })
      await nodeCliUtils.spawnAsync('dotnet', ['run', '--project', drsConfig.dbMigratorPath, 'dbInitialCreate'], { throwOnNonZero: true })
      return
    }
  }
  throw new Error(`Unknown DbMigrator command: ${command}`)
}

async function doRunBuilt() {
  const buildEnvPath = path.join(drsConfig.buildDir, '.env')
  await fsp.writeFile(buildEnvPath, '\nASPNETCORE_ENVIRONMENT=Production', { flag: 'a' })
  await fsp.writeFile(buildEnvPath, `\nPRE_DEPLOY_HTTP_PORT=${drsConfig.preDeployHttpPort}`, { flag: 'a' })
  await fsp.writeFile(buildEnvPath, `\nPRE_DEPLOY_HTTPS_PORT=${drsConfig.preDeployHttpsPort}`, { flag: 'a' })
  const siteUrl = nodeCliUtils.getRequiredEnvVar('SITE_URL')
  const devCertName = `${siteUrl}.pfx`
  const certSourcePath = path.join('./cert/', devCertName)
  const certDestinationPath = path.join(drsConfig.buildDir, devCertName)
  await fsp.copyFile(certSourcePath, certDestinationPath)
  await nodeCliUtils.spawnAsyncLongRunning('dotnet', ['WebServer.dll', '--launch-profile', '"PreDeploy"'], './build/')
}

async function checkDependenciesForSetup() {
  const depsChecker = drsConfig.getDependencyChecker()
  let report = await depsChecker.getReport()
  if (drsConfig.getNoDbVal()) {
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
  const depsChecker = drsConfig.getDependencyChecker()
  const dependenciesReport = await depsChecker.getReport()
  log('Checking dependencies:')
  log(depsChecker.getFormattedReport(dependenciesReport, true, ['Elevated Permissions', 'DB_PORT is available', 'DEV_CLIENT_PORT is available', 'DEV_SERVER_PORT is available']))

  log('Checking cert and hosts setup:')
  const hostname = nodeCliUtils.getHostname(drsConfig.getSiteUrl())
  const certFileStatus = { key: 'Cert file exists', value: fs.existsSync(`./cert/${hostname}.pfx`) }
  const certInstalledStatus = { key: 'Cert installed', value: await certUtils.winCertIsInstalled(hostname) }
  const hostsStatus = { key: 'Hosts entry exists', value: await nodeCliUtils.hostsFileHasEntry(drsConfig.getSiteUrl()) }
  const othersReport: StringBoolArray = [certFileStatus, certInstalledStatus, hostsStatus]
  log(depsChecker.getFormattedReport(othersReport))
}

async function setupCert() {
  await drsConfig.getProjectSetupUtil().ensureCertSetup(drsConfig.getSiteUrl())
}

async function setupHostsEntry() {
  await nodeCliUtils.ensureHostsEntry(drsConfig.getSiteUrl())
}

async function checkDependenciesForTeardown() {
  if (!await drsConfig.getDependencyChecker().hasElevatedPermissions()) {
    throw new Error('Elevated permissions are required to run teardown')
  }
}

async function teardownCert() {
  await drsConfig.getProjectSetupUtil().teardownCertSetup(drsConfig.getSiteUrl())
}

async function teardownHostsEntry() {
  await nodeCliUtils.removeHostsEntry(drsConfig.getSiteUrl())
}

async function teardownDb() {
  if (drsConfig.getNoDbVal()) {
    log('"nodb" option recognized - skipping DB teardown')
    return
  }
  if (!await nodeCliUtils.getConfirmation(`Do you want to completely destroy your database? (this will delete './docker/pg')`)) {
    return
  }
  await swigDocker.dockerDown()
  await nodeCliUtils.emptyDirectory('docker/pg')
}
