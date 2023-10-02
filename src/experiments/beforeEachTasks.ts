import { log } from '@mikeyt23/node-cli-utils'
import { series, TaskOrNamedTask } from 'swig-cli'

const beforeTasks: TaskOrNamedTask[] = []
export function addBeforeEach(task: TaskOrNamedTask) {
  beforeTasks.push(task)
}

export const temp = series(doBeforeTasks, test1, test2)

async function doBeforeTasks() {
  if (doBeforeTasks.length === 0) {
    log('no beforeTasks tasks registered - skipping')
  }
  series(beforeTasks[0], ...beforeTasks.slice(1))()
}

async function test1() {
  console.log('test1')
}

async function test2() {
  console.log('test2')
}
