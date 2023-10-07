class SwigDockerConfig {
  dockerComposePath: string = './docker-compose.yml'
}

/**
 * You only need to import this config if you need to change the default docker compose path (`./docker-compose.yml`).
 */
const swigDockerConfig = new SwigDockerConfig()

export default swigDockerConfig
