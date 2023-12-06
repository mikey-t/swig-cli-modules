// Project url: https://github.com/mikey-t/dotnet-react-sandbox

import * as nodeCliUtils from '@mikeyt23/node-cli-utils'
import { log } from '@mikeyt23/node-cli-utils'
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
import { syncEnvFiles } from './DotnetReactSandboxInternal.js'

export * from '../DockerCompose/DockerCompose.js'
export * from '../EntityFramework/EntityFramework.js'
export { deleteEnvCopies, syncEnvFiles } from './DotnetReactSandboxInternal.js'

export const setupStatus = series(
  syncEnvFiles,
  reportSetupStatus
)

export const setup = series(
  syncEnvFiles,
  checkDependenciesForSetup,
  setupCert,
  setupHostsEntry,
  ['dockerUp', () => nodeCliUtils.conditionallyAsync(!config.nodb, swigDocker.dockerUp)],
  ['dbSetup', () => nodeCliUtils.conditionallyAsync(
    !config.nodb,
    () => nodeCliUtils.withRetryAsync(swigEf.dbSetup, 5, 3000, { initialDelayMilliseconds: 10000 }))
  ],
  ['dbMigrate', () => nodeCliUtils.conditionallyAsync(!config.nodb, swigEf.dbMigrate)]
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
export const buildAll = series(parallel(syncEnvFiles, ensureReleaseDir), parallel(doBuildClient, doBuildServer), doCopyClientBuild)

export const runBuilt = series(syncEnvFiles, doRunBuilt)

export const createRelease = parallel(series(buildAll, createReleaseTarball), ['dbCreateRelease', () => swigEf.dbCreateRelease(config.mainDbContextName)])
export const createReleaseTarballOnly = createReleaseTarball

export const bashIntoDb = () => swigDocker.dockerBash(config.dbContainerName)

export const configureDotnetDevCerts = dotnetUtils.configureDotnetDevCerts

export async function deleteBuildAndRelease() {
  for (const dir of ['./build', './release']) {
    if (fs.existsSync(dir)) {
      await fsp.rm(dir, { recursive: true })
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
