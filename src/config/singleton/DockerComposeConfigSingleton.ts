import { DockerComposeConfig } from '../DockerComposeConfig.js'

/**
 * You only need to import this config if you need to change the default docker compose path (`./compose.yaml`).
 */
const config = new DockerComposeConfig()

export default config
