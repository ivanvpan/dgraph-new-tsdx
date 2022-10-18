import executeGraph, { DbGraph } from '../src'

describe('Graph', () => {
  it('executes basic transform', () => {
    const graph = {
      data: [
        {
          name: 'doubled',
          type: 'transform',
          fn: 'mult',
          params: {
            amt: 'inputs.doubleMe',
            factor: 2,
          },
        },
      ],
    }
    const input = {
      doubleMe: 10,
    }
    const result = executeGraph(graph as DbGraph, input)

    expect(result.doubled).toBe(20)
  })
})
