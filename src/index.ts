
import isArray from 'lodash/isArray'
import isString from 'lodash/isString'
import omit from 'lodash/omit'
import transforms from './transforms'
import { getValueAtPathWithArraySupport } from './path-utils';

interface Context {
  inputs: {[input: string]: any}
  graphDefs: {[input: string]: any}
  [field: string]: any;
}

type StepType = 'transform' | 'static' | 'branch' | 'alias' | 'dereference' | 'graph'

type Graph = GraphStep[]

interface DbGraph {
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
      console.error(`Could not resolve value ${pathOrValue}, returning string itself.`)
      resolved = pathOrValue
    }
  }
  return resolved
}

function resolveParams(context: Context, params: { [name: string]: any }) {
  return Object.fromEntries(Object.entries(params)
    .map(entry => [entry[0], resolvePathOrValue(context, entry[1])]))
}

function executeStep(context: Context, step: GraphStep) {
  const type = step.type
  switch (type) {
    case 'graph':
      const name = step.name
      if (!step.isTemplate) {
        let subGraph: Graph
        if (isArray(step.graphDef)) { // not a call to a saved subgraph
          subGraph = step.graphDef as Graph
        } else {
          subGraph = context.graphDefs[step.graphDef as string]
        }
        const inputs = resolveParams(context, step.inputs)
        // this means that we want to map the "collection" input variable
        if (step.collectionMode === 'map') {
          console.log(`=== using graph ${name} to map ${step.inputs.collection}, inputs: ${JSON.stringify(inputs)}`)
          context[name] = (inputs.collection as any).map(item => {
            const mapInputs = Object.assign({}, inputs, { item })
            return executeGraph({ inputs: mapInputs, graphDefs: context.graphDefs }, subGraph)
          })
          console.log(`=== mapping subgraph end: ${name}`)
        } else {
          console.log(`=== subgraph start: ${name}. inputs: ${JSON.stringify(inputs)}`)
          context[name] = executeGraph({ inputs, graphDefs: context.graphDefs }, subGraph)
          console.log(`=== subgraph end: ${name}`)
        }
      } else {
        console.log(`define template graph: ${step.name}`)
        context.graphDefs[step.name] = step.graphDef
      }
      break;
    case 'transform':
      const fn = transforms[step.fn]
      if (!fn) {
        console.error('No such function', step.fn)
        break;
      }
      const params = resolveParams(context, step.params)
      context[step.name] = transforms[step.fn](params)
      console.log(`${step.name} = ${step.fn}(${JSON.stringify(params)})`)
      break;
    case 'dereference':
      const theObject = resolvePathOrValue(context, step.objectPath)
      const prop = resolvePathOrValue(context, step.propNamePath)

      context[step.name] = theObject[prop]
      console.log(`${step.name} = ${step.objectPath}['${step.propNamePath}']`)
      break;
    case 'alias':
      const value = resolvePathOrValue(context, step.mirror)
      context[step.name] = value
      console.log(`${step.name} = ${step.mirror}`)
      break;
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
      console.log(`${step.name} = "${resolvedNodeName.resolved}"`)
      break;
    case 'static':
      context[step.name] = step.value
      console.log(`${step.name} = "${step.value}"`)
      break;
    default:
      console.log(`ERROR: unknown step type: ${step.type}`)
  }
}

function executeGraph(context: Context, graph: Graph) {
  graph.forEach((step) => executeStep(context, step))
  return omit(context, ['inputs', 'graphDefs']) // TODO hacky!
}

export default function externalExecute(inputs: any, graph: DbGraph) {
  const context: Context = {
    // inputs: resDayratesBaseDGraphInputs,
    inputs,
    graphDefs: {}
  }
  return executeGraph(context, graph.data)
}