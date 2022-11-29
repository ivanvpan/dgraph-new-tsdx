import isArray from 'lodash/isArray'
import toPath from 'lodash/toPath'
import isString from 'lodash/isString'
import transforms from './transforms'
import isNumber from 'lodash/isNumber'
import { getValueAtPathWithArraySupport } from './path-utils'

let outputOptions = {
  enabled: false,
  contextName: '[dgraph-new]',
}

function debug(msg: string | Error, warning = false) {
  if (outputOptions.enabled) {
    if (msg instanceof Error) {
      console.error(msg.message)
    } else if (warning) {
      console.warn(outputOptions.contextName, msg)
    } else {
      console.log(outputOptions.contextName, msg)
    }
  }
}

type Output = { [outputKey: string]: any }
interface Context {
  graphDefs: { [graphName: string]: any }
  executedSteps: { [stepName: string]: boolean }
  runtimeValues: {
    inputs: { [input: string]: any }
    [field: string]: any
  }
  output: Output
  parentContext?: ParentContext
}

interface ParentContext {
  context: Context
  graph: Graph
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

  // in-app-only
  namespace?: string

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

function resolvePathOrValue(
  graph: Graph,
  context: Context,
  pathOrValue: string
) {
  function tryResolving(obj, porv) {
    try {
      return getValueAtPathWithArraySupport(obj, porv)
    } catch (error) {
      debug(error)
    }
  }

  let resolved: any | undefined = pathOrValue

  if (isString(pathOrValue)) {
    resolved = tryResolving(context.runtimeValues, pathOrValue)

    // If the value does not resolve to some precomputed value we need to check if there
    // is a step somewhere ahead in the graph that needs to run first. This is because
    // the original dgraph is needlessly non-linear. Dependencies could be anywhere but the execution
    // is linear.
    if (resolved === undefined) {
      const dependency = graph.find(
        step => step.name === toPath(pathOrValue)[0]
      )
      if (dependency) {
        STEP_TYPE_RESOLVERS[dependency.type](dependency, graph, context)
        resolved = tryResolving(context.runtimeValues, pathOrValue)
      }
    }

    // And yet another way to call subgraphs is by just calling it directly and
    // implicitly pass the whole state of the current context. The current context,
    // though, will be referenced via `inputs.`. (ノಠ益ಠ)ノ彡┻━┻
    if (resolved === undefined) {
      const firstSegment = toPath(pathOrValue)[0]
      const dependency = context.graphDefs[firstSegment]
      if (dependency) {
        const graphStep: GraphStep = {
          name: firstSegment + '.execution-instance',
          type: 'graph',
          graphDef: dependency,
          namespace: firstSegment,
          inputs: {},
        }
        executeStep(graphStep, graph, context, true)
        resolved = tryResolving(context.runtimeValues, pathOrValue)
      }
    }

    if (
      resolved === undefined &&
      pathOrValue.startsWith('inputs.') &&
      context.parentContext
    ) {
      const pathWithoutInputSegment = toPath(pathOrValue)
        .slice(1)
        .join('.')
      resolved = resolvePathOrValue(
        context.parentContext.graph,
        context.parentContext.context,
        pathWithoutInputSegment
      )
    }

    if (resolved === undefined) {
      debug(
        `Could not resolve value ${pathOrValue}, returning string itself.`,
        true
      )
      resolved = pathOrValue
    }
  }

  return resolved
}

function resolveParams(
  graph: Graph,
  context: Context,
  params: { [name: string]: any } | string | number
) {
  if (isString(params)) {
    return resolvePathOrValue(graph, context, params)
  } else if (isNumber(params)) {
    return params
  } else {
    return Object.fromEntries(
      Object.entries(params).map(entry => [
        entry[0],
        resolvePathOrValue(graph, context, entry[1]),
      ])
    )
  }
}

function setValueInContext(
  context: Context,
  key: string,
  value: any,
  excludeFromOutput = false
) {
  context.runtimeValues[key] = value

  if (!excludeFromOutput) {
    context.output[key] = value
  }
}

const STEP_TYPE_RESOLVERS: { [stepType: string]: Function } = {
  comments: () => {},
  echo: (step: GraphStep, _graph: Graph, context: Context) => {
    const value = resolvePathOrValue(_graph, context, 'inputs.' + step.name)

    setValueInContext(context, step.name, value)

    debug(`echo: ${step.name} = ${JSON.stringify(value)}`)
  },
  graph: (step: GraphStep, graph: Graph, context: Context) => {
    const name = step.name

    // TODO logic that recognizes what sort of 'graph' step it is repeated in a few places
    // and could be more DRY and more formalized.

    // It is not documented but graphs definitions without inputs are effectively "template" graphs.
    if (step.isTemplate || (isArray(step.graphDef) && !step.inputs)) {
      debug(`define template graph: ${step.name}`)
      context.graphDefs[step.name] = step.graphDef
    } else {
      let subGraph: Graph

      // graph that could be called in place
      if (isArray(step.graphDef)) {
        subGraph = step.graphDef as Graph
      } else {
        subGraph = context.graphDefs[step.graphDef as string]
        if (!subGraph) {
          throw new Error(
            `Trying to execute a non-existant graph '${step.graphDef}'`
          )
        }
      }
      const inputs = resolveParams(graph, context, step.inputs)

      // the step wants to iterate over the "collection" input variable
      if (step.collectionMode === 'map') {
        debug(
          `=== using graph ${name} to map ${
            step.inputs.collection
          }, inputs: ${JSON.stringify(inputs)}`
        )
        const result = (inputs.collection as any).map(item => {
          const mapInputs = Object.assign({}, inputs, { item })
          return executeGraph(subGraph, {
            executedSteps: {},
            graphDefs: context.graphDefs,
            runtimeValues: {
              inputs: mapInputs,
            },
            output: {},
          })
        })
        setValueInContext(context, step.name, result, step.isHidden)
        debug(`=== mapping subgraph end: ${name}`)
      } else if (step.namespace) {
        // This is when we run a subgraph by referencing its definitions directly
        // and the current context becomes the implicit input.
        debug(`running subgraph ${step.name} in parent context:`)
        debug(`=== subgraph start: ${name}. inputs: ${JSON.stringify(inputs)}`)
        const result = executeGraph(subGraph, {
          parentContext: {
            context,
            graph,
          },
          executedSteps: {},
          graphDefs: context.graphDefs,
          runtimeValues: {
            inputs: {},
          },
          output: {},
        })
        setValueInContext(context, step.namespace, result, step.isHidden)
        debug(`=== subgraph end: ${name}`)
      } else {
        // execute the graph normally
        debug(`=== subgraph start: ${name}. inputs: ${JSON.stringify(inputs)}`)
        const result = executeGraph(subGraph, {
          executedSteps: {},
          graphDefs: context.graphDefs,
          runtimeValues: {
            inputs,
          },
          output: {},
        })
        setValueInContext(context, step.name, result, step.isHidden)
        debug(`=== subgraph end: ${name}`)
      }
    }
  },
  transform: (step: GraphStep, graph: Graph, context: Context) => {
    const fn = transforms[step.fn]
    if (!fn) {
      throw new Error(`No such function ${step.fn}`)
    }
    const params = resolveParams(graph, context, step.params)

    setValueInContext(
      context,
      step.name,
      transforms[step.fn](params),
      step.isHidden
    )

    debug(
      `transform: ${step.name} = ${step.fn}(${step.params}) = ${
        step.fn
      }(${JSON.stringify(params)})`
    )
  },
  dereference: (step: GraphStep, graph: Graph, context: Context) => {
    const theObject = resolvePathOrValue(graph, context, step.objectPath)
    const prop = resolvePathOrValue(graph, context, step.propNamePath)

    setValueInContext(context, step.name, theObject[prop], step.isHidden)

    debug(
      `dereference: ${step.name} = ${step.objectPath}['${step.propNamePath}'] = ${theObject[prop]}`
    )
  },
  alias: (step: GraphStep, graph: Graph, context: Context) => {
    const value = resolvePathOrValue(graph, context, step.mirror)

    setValueInContext(context, step.name, value, step.isHidden)

    debug(`alias: ${step.name} = ${step.mirror} = ${value}`)
  },
  branch: (step: GraphStep, graph: Graph, context: Context) => {
    const DEFAULT = '_default_'
    const testValue = resolvePathOrValue(graph, context, step.test)

    let index = step.cases.indexOf(testValue)
    if (index === -1) {
      index = step.cases.indexOf(DEFAULT)
    }

    const nodeName = step.nodeNames[index]
    const resolvedNodeValue = resolvePathOrValue(graph, context, nodeName)
    setValueInContext(context, step.name, resolvedNodeValue, step.isHidden)
    debug(`branch: ${step.name} = ${nodeName} = '${resolvedNodeValue}'`)
  },
  static: (step: GraphStep, _graph: Graph, context: Context) => {
    setValueInContext(context, step.name, step.value, step.isHidden)
    debug(`static: ${step.name} = "${step.value}"`)
  },
}

// Because subgraph definitions could be anywhere we will just bring them up to the top.
// The function does not modify the passed graph but returns a copy.
function hoistSubgraphDefinitions(graph: Graph) {
  const newGraph: Graph = []
  graph.forEach(step => {
    if (
      step.type === 'graph' &&
      (step.isTemplate || (isArray(step.graphDef) && !step.inputs))
    ) {
      newGraph.unshift(step)
    } else {
      newGraph.push(step)
    }
  })
  return newGraph
}

function executeStep(
  step: GraphStep,
  graph: Graph,
  context: Context,
  runInParentContext = false
) {
  if (context.executedSteps[step.name]) {
    debug(`already ran ${step.name}`, true)
    return
  }
  context.executedSteps[step.name] = true
  const type = step.type
  const resolver = STEP_TYPE_RESOLVERS[type]
  if (!resolver) {
    throw new Error(`Unknown step type: ${step.type}`)
  }

  resolver(step, graph, context, runInParentContext)
}

function executeGraph(graph: Graph, context: Context): Output {
  const withHoistedDefinitions = hoistSubgraphDefinitions(graph)
  withHoistedDefinitions.forEach(step => executeStep(step, graph, context))
  return context.output
}

export default function externalExecute(
  graph: DbGraph | Graph,
  inputs: any,
  debug = false
) {
  outputOptions.enabled = debug
  const context: Context = {
    executedSteps: {},
    graphDefs: {},
    runtimeValues: {
      inputs,
    },
    output: {},
  }
  const toExecute = isArray(graph) ? (graph as Graph) : (graph as DbGraph).data
  return executeGraph(toExecute, context)
}
