import { spawnDockerCompose } from '@mikeyt23/node-cli-utils'
import { swigDockerConfig } from '../../config/SwigDockerComposeConfig.js'
import { getRequireSecondParam, isValidDockerContainerName } from '../../utils/generalUtils.js'

export async function dockerUp() {
  await spawnDockerCompose(swigDockerConfig.dockerComposePath, 'up')
}

export async function dockerUpAttached() {
  await spawnDockerCompose(swigDockerConfig.dockerComposePath, 'up', { attached: true })
}

export async function dockerDown() {
  await spawnDockerCompose(swigDockerConfig.dockerComposePath, 'down')
}

export async function bashIntoContainer(containerName?: string) {
  const containerNameToUse = containerName ?? getContainerNameFromCliParam()
  await spawnDockerCompose(swigDockerConfig.dockerComposePath, 'exec', { args: ['-it', containerNameToUse, 'bash'], attached: true })
}

function getContainerNameFromCliParam() {
  const containerNameCliParam = getRequireSecondParam('Missing param for which container to bash into - example: swig bashIntoContainer postgresql')
  if (!isValidDockerContainerName) {
    throw new Error(`Container name is invalid: ${containerNameCliParam}`)
  }
  return containerNameCliParam
}
