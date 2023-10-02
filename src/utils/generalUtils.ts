export function getRequireSecondParam(errorMessage: string) {
  const secondParam = process.argv[3]
  if (!secondParam) {
    throw new Error(errorMessage)
  }
  return secondParam
}

export function isValidDockerContainerName(containerName: string) {
  return /[a-zA-Z0-9][a-zA-Z0-9_.-]+/.test(containerName)
}

export async function conditionally(condition: boolean, asyncFunc: () => Promise<void>) {
  if (condition) {
    console.log('condition true - running')
    await asyncFunc()
  } else {
    console.log('condition false - skipping')
  }
}
