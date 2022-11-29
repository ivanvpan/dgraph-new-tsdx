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

describe('General graph features', () => {
  it('executes basic transform', () => {
    const graph = {
      data: [DOUBLE_STEP],
    }
    const input = {
      doubleMe: 10,
    }

    const result = executeGraph(graph as DbGraph, input)

    expect(result.doubled).toBe(20)
  })

  it('executes transform with single param', () => {
    const graph = {
      data: [
        {
          name: 'added',
          type: 'transform',
          fn: 'addN',
          params: 'inputs.addUs',
        },
      ],
    }
    const input = {
      addUs: [1,2,3],
    }

    const result = executeGraph(graph as DbGraph, input)

    expect(result.added).toBe(6)
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

  it('correctly runs mapping subgraph calls', () => {
    const graph = {
      data: [
        {
          name: 'doubleMapper',
          type: 'graph',
          graphDef: [
            {
              name: 'doubled',
              type: 'transform',
              fn: 'mult',
              params: {
                amt: 'inputs.item',
                factor: 2,
              },
            },
          ],
        },
        {
          name: 'doubledArray',
          type: 'graph',
          graphDef: 'doubleMapper',
          collectionMode: 'map',
          inputs: {
            collection: 'inputs.numbers.*',
          },
        },
      ],
    }

    const input = {
      numbers: [1, 2],
    }

    const result = executeGraph(graph as DbGraph, input)
    expect(result.doubledArray).toEqual([{ doubled: 2 }, { doubled: 4 }])
  })

  describe('direct reference to an unexecuted subgraph', () => {
    it('basic invocation works', () => {
      const graph = {
        data: [
          {
            name: 'the-doubler',
            type: 'graph',
            graphDef: [
              {
                name: 'result',
                type: 'transform',
                fn: 'mult',
                params: {
                  amt: 3,
                  factor: 2,
                },
              },
            ],
          },
          {
            name: 'doubled',
            type: 'alias',
            mirror: 'the-doubler.result',
          },
        ],
      }

      const input = {}

      const result = executeGraph(graph as DbGraph, input)
      expect(result.doubled).toBe(6)
    })

    it('does not leak its results into runtime', () => {
      const graph = {
        data: [
          {
            name: 'the-doubler',
            type: 'graph',
            graphDef: [
              {
                name: 'result',
                type: 'transform',
                fn: 'mult',
                params: {
                  amt: 3,
                  factor: 2,
                },
              },
            ],
          },
          {
            name: 'doubled',
            type: 'alias',
            mirror: 'the-doubler.result',
          },
        ],
      }

      const input = {}

      const result = executeGraph(graph as DbGraph, input)
      expect(result.result).toBeUndefined
    })

    it('can reference values from parent runtime as inputs', () => {
      const graph = {
        data: [
          {
            name: 'the-doubler',
            type: 'graph',
            graphDef: [
              {
                name: 'result',
                type: 'transform',
                fn: 'mult',
                params: {
                  amt: 'inputs.doubleMeInternal',
                  factor: 2,
                },
              },
            ],
          },
          {
            name: 'doubleMeInternal',
            type: 'alias',
            mirror: 'inputs.doubleMe',
          },
          {
            name: 'doubled',
            type: 'alias',
            mirror: 'the-doubler.result',
          },
        ],
      }

      const input = {
        doubleMe: 10,
      }

      const result = executeGraph(graph as DbGraph, input)
      expect(result.doubled).toBe(20)
    })

    it('can reference unevaluated values from parent runtime as inputs', () => {
      const graph = {
        data: [
          {
            name: 'two-doubler',
            type: 'graph',
            graphDef: [
              {
                name: 'result',
                type: 'transform',
                fn: 'mult',
                params: {
                  amt: 'inputs.oneDoubled.doubled',
                  factor: 2,
                },
              },
            ],
          },
          {
            name: 'twoDoubled',
            type: 'alias',
            mirror: 'two-doubler.result',
          },
          {
            name: 'one-doubler',
            type: 'graph',
            graphDef: [DOUBLE_STEP],
            isTemplate: true,
          },
          {
            name: 'oneDoubled',
            type: 'graph',
            graphDef: 'one-doubler',
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
      expect(result.twoDoubled).toBe(40)
    })

    it('when evaluating steps from parent scope ensure that parent scope gets updated with results', () => {
      const graph = {
        data: [
          {
            name: 'two-doubler',
            type: 'graph',
            graphDef: [
              {
                name: 'result',
                type: 'transform',
                fn: 'mult',
                params: {
                  amt: 'inputs.oneDoubled.doubled',
                  factor: 2,
                },
              },
            ],
          },
          {
            name: 'twoDoubled',
            type: 'alias',
            mirror: 'two-doubler.result',
          },
          {
            name: 'one-doubler',
            type: 'graph',
            graphDef: [DOUBLE_STEP],
            isTemplate: true,
          },
          {
            name: 'oneDoubled',
            type: 'graph',
            graphDef: 'one-doubler',
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
      expect(result.oneDoubled.doubled).toBe(20)
    })
  })
})
