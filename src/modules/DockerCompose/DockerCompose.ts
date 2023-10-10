import { isValidDockerContainerName, spawnDockerCompose } from '@mikeyt23/node-cli-utils/dockerUtils'
import config from '../../config/singleton/DockerComposeConfigSingleton.js'
import { getRequiredSwigTaskCliParam } from 'src/utils/swigCliModuleUtils.js'

export async function dockerUp() {
  await spawnDockerCompose(config.dockerComposePath, 'up')
}

export async function dockerUpAttached() {
  await spawnDockerCompose(config.dockerComposePath, 'up', { attached: true })
}

export async function dockerDown() {
  await spawnDockerCompose(config.dockerComposePath, 'down')
}

export async function bashIntoContainer(containerName?: string) {
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
