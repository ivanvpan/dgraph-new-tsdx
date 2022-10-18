import isArray from 'lodash/isArray'
import isString from 'lodash/isString'
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

type Output = { [outputKey: string]: any }
interface Context {
  inputs: { [input: string]: any }
  graphDefs: { [graphName: string]: any }
  _output: Output
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
    Object.entries(params).map((entry) => [
      entry[0],
      resolvePathOrValue(context, entry[1]),
    ])
  )
}

function setValueInContext(context: Context, key: string, value: any, excludeFromOutput = false) {
  context[key] = value

  if (!excludeFromOutput) {
    context._output[key] = value
  }
}

function executeStep(step: GraphStep, context: Context) {
  const type = step.type
  switch (type) {
    case 'graph':
      const name = step.name

      // It is not documented but graphs definitions without inputs are effectively "template" graphs.
      if (step.isTemplate || (isArray(step.graphDef) && !step.inputs)) {
        debug(`define template graph: ${step.name}`)
        context.graphDefs[step.name] = step.graphDef
      } else {
        let subGraph: Graph

        // not a call to a saved subgraph
        if (isArray(step.graphDef)) {
          subGraph = step.graphDef as Graph
        } else {
          subGraph = context.graphDefs[step.graphDef as string]
        }
        const inputs = resolveParams(context, step.inputs)

        // we want to iterate over the "collection" input variable
        if (step.collectionMode === 'map') {
          debug(
            `=== using graph ${name} to map ${
              step.inputs.collection
            }, inputs: ${JSON.stringify(inputs)}`
          )
          const result = (inputs.collection as any).map((item) => {
            const mapInputs = Object.assign({}, inputs, { item })
            return executeGraph(subGraph, {
              inputs: mapInputs,
              graphDefs: context.graphDefs,
              _output: {}
            })
          })
          setValueInContext(context, step.name, result, step.isHidden)
          debug(`=== mapping subgraph end: ${name}`)
        } else {
          debug(
            `=== subgraph start: ${name}. inputs: ${JSON.stringify(inputs)}`
          )
          const result = executeGraph(subGraph, {
            inputs,
            graphDefs: context.graphDefs,
            _output: {}
          })
          setValueInContext(context, step.name, result, step.isHidden)
          debug(`=== subgraph end: ${name}`)
        }
      }
      break
    case 'transform': {
      const fn = transforms[step.fn]
      if (!fn) {
        throw new Error(`No such function ${step.fn}`)
      }
      const params = resolveParams(context, step.params)

      setValueInContext(context, step.name, transforms[step.fn](params), step.isHidden)
      
      debug(`${step.name} = ${step.fn}(${JSON.stringify(params)})`)
      break
    }
    case 'dereference': {
      const theObject = resolvePathOrValue(context, step.objectPath)
      const prop = resolvePathOrValue(context, step.propNamePath)

      setValueInContext(context, step.name, theObject[prop], step.isHidden)

      debug(`${step.name} = ${step.objectPath}['${step.propNamePath}']`)
      break
    }
    case 'alias': {
      const value = resolvePathOrValue(context, step.mirror)

      setValueInContext(context, step.name, value, step.isHidden)

      debug(`${step.name} = ${step.mirror}`)
      break
    }
    case 'branch': {
      const DEFAULT = '_default_'
      const testValue = resolvePathOrValue(context, step.test)

      let index = step.cases.indexOf(testValue)
      if (index === -1) {
        index = step.cases.indexOf(DEFAULT)
      }

      const nodeName = step.nodeNames[index]
      const resolvedNodeName = resolvePathOrValue(context, nodeName)
      setValueInContext(context, step.name, resolvedNodeName, step.isHidden)
      debug(`${step.name} = "${resolvedNodeName.resolved}"`)
      break
    }
    case 'static': {
      setValueInContext(context, step.name, step.value, step.isHidden)
      debug(`${step.name} = "${step.value}"`)
      break
    }
    default: {
      throw new Error(`Unknown step type: ${step.type}`)
    }
  }
}

function executeGraph(graph: Graph, context: Context): Output  {
  graph.forEach((step) => executeStep(step, context))
  return context._output
}

export default function externalExecute(
  graph: DbGraph,
  inputs: any,
  debug = false
) {
  outputOptions.enabled = debug
  const context: Context = {
    // inputs: resDayratesBaseDGraphInputs,
    inputs,
    graphDefs: {},
    _output: {}
  }
  return executeGraph(graph.data, context)
}
