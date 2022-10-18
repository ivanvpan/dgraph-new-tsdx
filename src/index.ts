import isArray from 'lodash/isArray'
import isString from 'lodash/isString'
import omit from 'lodash/omit'
import transforms from './transforms'
import { getValueAtPathWithArraySupport } from './path-utils'

let outputOptions = {
  enabled: false,
  contextName: '[dgraph-new]',
}

function debug(msg: string, warning = false) {
  if (outputOptions.enabled) {
    if (warning) {
      console.warn(outputOptions.contextName, msg)
    } else {
      console.log(outputOptions.contextName, msg)
    }
  }
}

interface Context {
  inputs: { [input: string]: any }
  graphDefs: { [input: string]: any }
  [field: string]: any
}

type StepType =
  | 'transform'
  | 'static'
  | 'branch'
  | 'alias'
  | 'dereference'
  | 'graph'

type Graph = GraphStep[]

export interface DbGraph {
  namespace: string
  name: string
  data: Graph
  type: string
}

interface GraphStep {
  name: string
  type: StepType
  isHidden?: boolean
  comments?: string

  // transform
  params?: any
  fn?: string

  // static
  value?: string | number

  // graph
  graphDef?: string | Graph
  isTemplate?: any
  inputs?: any
  collectionMode?: string

  // dereference
  objectPath?: string
  propNamePath?: string

  // branch
  test?: string
  cases?: string[]
  nodeNames?: string[]

  // alias
  mirror?: string
}

function resolvePathOrValue(context: Context, pathOrValue: string) {
  let resolved: any | undefined = pathOrValue
  if (isString(pathOrValue)) {
    resolved = getValueAtPathWithArraySupport(context, pathOrValue)
    if (resolved === undefined) {
      console.warn(
        `Could not resolve value ${pathOrValue}, returning string itself.`
      )
      resolved = pathOrValue
    }
  }
  return resolved
}

function resolveParams(context: Context, params: { [name: string]: any }) {
  return Object.fromEntries(
    Object.entries(params).map(entry => [
      entry[0],
      resolvePathOrValue(context, entry[1]),
    ])
  )
}

function executeStep(step: GraphStep, context: Context) {
  const type = step.type
  switch (type) {
    case 'graph':
      const name = step.name
      if (!step.isTemplate) {
        let subGraph: Graph
        if (isArray(step.graphDef)) {
          // not a call to a saved subgraph
          subGraph = step.graphDef as Graph
        } else {
          subGraph = context.graphDefs[step.graphDef as string]
        }
        const inputs = resolveParams(context, step.inputs)
        // this means that we want to map the "collection" input variable
        if (step.collectionMode === 'map') {
          debug(
            `=== using graph ${name} to map ${
              step.inputs.collection
            }, inputs: ${JSON.stringify(inputs)}`
          )
          context[name] = (inputs.collection as any).map(item => {
            const mapInputs = Object.assign({}, inputs, { item })
            return executeGraph(subGraph, {
              inputs: mapInputs,
              graphDefs: context.graphDefs,
            })
          })
          debug(`=== mapping subgraph end: ${name}`)
        } else {
          debug(
            `=== subgraph start: ${name}. inputs: ${JSON.stringify(inputs)}`
          )
          context[name] = executeGraph(subGraph, {
            inputs,
            graphDefs: context.graphDefs,
          })
          debug(`=== subgraph end: ${name}`)
        }
      } else {
        debug(`define template graph: ${step.name}`)
        context.graphDefs[step.name] = step.graphDef
      }
      break
    case 'transform':
      const fn = transforms[step.fn]
      if (!fn) {
        throw new Error(`No such function ${step.fn}`)
      }
      const params = resolveParams(context, step.params)
      context[step.name] = transforms[step.fn](params)
      debug(`${step.name} = ${step.fn}(${JSON.stringify(params)})`)
      break
    case 'dereference':
      const theObject = resolvePathOrValue(context, step.objectPath)
      const prop = resolvePathOrValue(context, step.propNamePath)

      context[step.name] = theObject[prop]
      debug(`${step.name} = ${step.objectPath}['${step.propNamePath}']`)
      break
    case 'alias':
      const value = resolvePathOrValue(context, step.mirror)
      context[step.name] = value
      debug(`${step.name} = ${step.mirror}`)
      break
    case 'branch':
      const DEFAULT = '_default_'
      const testValue = resolvePathOrValue(context, step.test)

      let index = step.cases.indexOf(testValue)
      if (index === -1) {
        index = step.cases.indexOf(DEFAULT)
      }

      const nodeName = step.nodeNames[index]
      const resolvedNodeName = resolvePathOrValue(context, nodeName)
      context[step.name] = resolvedNodeName
      debug(`${step.name} = "${resolvedNodeName.resolved}"`)
      break
    case 'static':
      context[step.name] = step.value
      debug(`${step.name} = "${step.value}"`)
      break
    default:
      throw new Error(`Unknown step type: ${step.type}`)
  }
}

function executeGraph(graph: Graph, context: Context) {
  graph.forEach(step => executeStep(step, context))
  return omit(context, ['inputs', 'graphDefs']) // TODO hacky!
}

export default function externalExecute(
  graph: DbGraph,
  inputs: any,
  debug = true
) {
  outputOptions.enabled = debug
  const context: Context = {
    // inputs: resDayratesBaseDGraphInputs,
    inputs,
    graphDefs: {},
  }
  return executeGraph(graph.data, context)
}
