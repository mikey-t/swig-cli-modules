import { isValidDockerContainerName, spawnDockerCompose } from '@mikeyt23/node-cli-utils/dockerUtils'
import config from '../../config/singleton/DockerComposeConfigSingleton.js'
import { getRequiredSwigTaskCliParam } from '../../utils/swigCliModuleUtils.js'

export async function dockerUp() {
  await runBeforeHooks()
  await spawnDockerCompose(config.dockerComposePath, 'up')
}

export async function dockerUpAttached() {
  await runBeforeHooks()
  await spawnDockerCompose(config.dockerComposePath, 'up', { attached: true })
}

export async function dockerDown() {
  await runBeforeHooks()
  await spawnDockerCompose(config.dockerComposePath, 'down')
}

export async function dockerBash(containerName?: string) {
  await runBeforeHooks()
  const containerNameToUse = containerName ?? getContainerNameFromCliParam()
  await spawnDockerCompose(config.dockerComposePath, 'exec', { args: ['-it', containerNameToUse, 'bash'], attached: true })
}

function getContainerNameFromCliParam() {
  const containerNameCliParam = getRequiredSwigTaskCliParam(0, 'Missing param for which container to bash into - example: swig bashIntoContainer postgresql')
  if (!isValidDockerContainerName) {
    throw new Error(`Container name is invalid: ${containerNameCliParam}`)
  }
  return containerNameCliParam
}

async function runBeforeHooks() {
  for (const hook of config.beforeHooks) {
    await hook()
  }
}
