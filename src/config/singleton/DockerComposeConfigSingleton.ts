import { DockerComposeConfig } from '../DockerComposeConfig.js'

/**
 * You only need to import this config if you need to change the default docker compose path (`./docker-compose.yml`).
 */
const config = new DockerComposeConfig()

export default config
