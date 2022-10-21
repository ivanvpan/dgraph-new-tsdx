import executeGraph, { DbGraph } from '../src'

const DOUBLE_STEP = {
  name: 'doubled',
  type: 'transform',
  fn: 'mult',
  params: {
    amt: 'inputs.doubleMe',
    factor: 2,
  },
}

describe('Graph', () => {
  it('executes basic transform', () => {
    const graph = {
      data: [DOUBLE_STEP],
    }
    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input, true)

    expect(result.doubled).toBe(20)
  })

  it('creates static value', () => {
    const graph = {
      data: [
        {
          name: 'hellow',
          type: 'static',
          value: 'world',
        },
      ],
    }

    const result = executeGraph(graph as DbGraph, {})

    expect(result.hellow).toBe('world')
  })

  it('executes a non-template subgraph', () => {
    const graph = {
      data: [
        {
          name: 'doubler',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
          inputs: {
            doubleMe: 'inputs.doubleMe',
          },
        },
      ],
    }

    const input = {
      doubleMe: 10,
    }
    const result = executeGraph(graph as DbGraph, input)

    expect(result.doubler.doubled).toBe(20)
  })

  it('executes a template subgraph', () => {
    const graph = {
      data: [
        {
          name: 'doubler',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
          isTemplate: true,
        },
        {
          name: 'theGoods',
          type: 'graph',
          graphDef: 'doubler',
          inputs: {
            doubleMe: 'inputs.doubleMe',
          },
        },
      ],
    }

    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)
    expect(result.theGoods.doubled).toBe(20)
  })

  it('a subgraph without inputs is effectively a "template" subgraph', () => {
    const graph = {
      data: [
        {
          name: 'doubler',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
        },
        {
          name: 'theGoods',
          type: 'graph',
          graphDef: 'doubler',
          inputs: {
            doubleMe: 'inputs.doubleMe',
          },
        },
      ],
    }

    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)
    expect(result.theGoods.doubled).toBe(20)
  })

  it('hides values from output when isHidden is specified', () => {
    const graph = {
      data: [Object.assign({ isHidden: true }, DOUBLE_STEP)],
    }
    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)

    expect(result.doubled).toBeUndefined()
  })

  it('Runs subgraph definition first', () => {
    const graph = {
      data: [
        {
          name: 'graphResult',
          type: 'graph',
          graphDef: 'lonely-souls',
          inputs: {
            doubleMe: 'inputs.doubleMe',
          },
        },
        {
          name: 'lonely-souls',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
          isTemplate: true,
        },
      ],
    }

    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)
    expect(result.graphResult.doubled).toBe(20)
  })

  it('executes subgraph correctly even if they are not in order of dependency', () => {
    const graph = {
      data: [
        {
          name: 'lonely-souls',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
          isTemplate: true,
        },
        {
          name: 'doubled',
          type: 'transform',
          fn: 'mult',
          params: {
            amt: 'lonelySouls.doubled',
            factor: 2,
          },
        },
        {
          name: 'lonelySouls',
          type: 'graph',
          graphDef: 'lonely-souls',
          inputs: {
            doubleMe: 'inputs.doubleMe',
          },
        },
      ],
    }

    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)
    expect(result.doubled).toBe(40)
  })

  it('executes non-subgraph dependencies correctly even if they are not in order', () => {
    const graph = {
      data: [
        {
          name: 'doubledAgain',
          type: 'transform',
          fn: 'mult',
          params: {
            amt: 'doubled',
            factor: 2,
          },
        },
        DOUBLE_STEP,
      ],
    }

    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)
    expect(result.doubledAgain).toBe(40)
  })

  fit('executes a subgraph with current runtime when it is invoked directly', () => {
    const graph = {
      data: [
        {
          name: 'the-doubler',
          type: 'graph',
          graphDef: [
            {
              name: 'doubled',
              type: 'transform',
              fn: 'mult',
              params: {
                amt: 'inputs.summed',
                factor: 2,
              },
            },
          ],
        },
        {
          name: 'doubled',
          type: 'alias',
          mirror: 'the-doubler.doubled'
        },
        {
          name: 'summed',
          type: 'transform',
          fn: 'add',
          params: {
            a: 'inputs.sumAndDoubleMe',
            b: 5,
          },
        },
      ],
    }

    const input = {
      sumAndDoubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input, true)
    console.log(result)
    expect(result.quadrupled).toBe(40)
  })
})
