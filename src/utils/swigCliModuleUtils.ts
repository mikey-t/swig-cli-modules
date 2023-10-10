// Utility functions in this file generally get moved to the npm package @mikeyt23/node-cli-utils unless they're specific to swig-cli-modules

/**
 * Same functionality as {@link getSwigTaskCliParam}, but throws an error if the value is `undefined`.
 * @param index Zero based index for params starting at the param after the swig task name.
 * @param errorMessage The error message to be used in the thrown error if the CLI param value is missing (`undefined`).
 * @returns 
 */
export function getRequiredSwigTaskCliParam(index: number, errorMessage: string) {
  const val = getSwigTaskCliParam(index)
  if (val === undefined) {
    throw new Error(errorMessage)
  }
  return val
}

/**
 * Gets the value of the CLI param in `process.argv` at `index` + 3.
 * 
 * Normal process.argv index values:
 * 
 * - 0: NodeJS path
 * - 1: SwigCli script path
 * - 2: Swig task name
 * - 3: This value and everything after it can be parsed as params for the swig task to operate on
 * 
 * @example
 * Example command:
 * 
 * ```bash
 * swig doStuff taskParamOne taskParamTwo
 * ```
 * 
 * Examples param retrieval:
 * 
 * ```javascript
 * const firstTaskParam = getSwigTaskCliParam(0) // Returns "taskParamOne"
 * const secondTaskParam = getSwigTaskCliParam(1) // Returns "taskParamTwo"
 * ```
 * 
 * @param index Zero based index for params starting at the param after the swig task name.
 */
export function getSwigTaskCliParam(index: number) {
  if (index < 0) {
    throw new Error(`Index must be greater than or equal to 0`)
  }
  return process.argv[index + 3]
}
