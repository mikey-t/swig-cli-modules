import { copyModifiedEnv, copyNewEnvValues, deleteEnvIfExists, ensureDirectory, log, overwriteEnvFile } from '@mikeyt23/node-cli-utils'
import fs from 'node:fs'
import path from 'node:path'
import config from '../../config/singleton/DotnetReactSandboxConfigSingleton.js'

let envSynced = false

// The syncEnvFiles method copies any new values from .env.template to .env and then copies .env to all directories in directoriesWithEnv array.
// Values added directly to .env files in directoriesWithEnv will not be overwritten, but this is not recommended.
// Instead, use your root .env file as the source of truth and never directly modify the others unless it's temporary.
//
// Use additional arg 'clean' to delete all the non-root .env copies before making new copies - useful for removing values that are no longer in the root .env file.
export async function syncEnvFiles(force = false) {
  if (envSynced && !force) {
    log(`env already synced - skipping`)
    return
  }
  envSynced = true
  log(`syncing env files`)
  const rootEnvPath = './.env'
  if (process.argv[3] && process.argv[3] === 'clean') {
    log(`syncEnvFiles called with 'clean' arg - deleting .env copies`)
    await deleteEnvCopies()
  }

  await copyNewEnvValues(`${rootEnvPath}.template`, rootEnvPath)

  // Load env vars from root .env file into process.env in case this is the first run or if there are new vars copied over from .env.template.
  config.loadEnvFunction()

  await ensureDirectory(config.buildWwwrootDir)
  for (const dir of config.directoriesWithEnv) {
    await overwriteEnvFile(rootEnvPath, path.join(dir, '.env'), { suppressAddKeysMessages: dir === config.serverTestPath })
  }
  await copyModifiedEnv(
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
      await deleteEnvIfExists(envPath)
    }
  }
}
