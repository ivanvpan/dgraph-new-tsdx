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

    const result = executeGraph(graph as DbGraph, input)

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
          name: 'lonelySouls',
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

    expect(result.lonelySouls.doubled).toBe(20)
  })

  it('executes a template subgraph', () => {
    const graph = {
      data: [
        {
          name: 'lonelySouls',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
          isTemplate: true
        },
        {
          name: 'theGoods',
          type: 'graph',
          graphDef: 'lonelySouls',
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
          name: 'lonelySouls',
          type: 'graph',
          graphDef: [DOUBLE_STEP],
        },
        {
          name: 'theGoods',
          type: 'graph',
          graphDef: 'lonelySouls',
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
})
