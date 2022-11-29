import executeGraph from '../src'
import fs from 'fs'
import path from 'path'

function loadAndParse(file: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, file)).toString())
}

describe('Graph dayrates computation', () => {
  it('Correctly performs tier dayrates computation', () => {
    const graph = loadAndParse('tier-dayrates-graph.json')
    const inputs = loadAndParse('tier-dayrates-input.json')
    const expectedResult = loadAndParse('tier-dayrates-output.json')

    const result = executeGraph(graph, inputs)

    expect(result).toEqual(expectedResult)
  })

  it('Correctly performs reservation dayrates computation', () => {
    const graph = loadAndParse('res-dayrates-base-graph.json')
    const inputs = loadAndParse('res-dayrates-base-input.json')
    const expectedResult = loadAndParse('res-dayrates-base-output.json')

    const result = executeGraph(graph, inputs)

    expect(result).toEqual(expectedResult)
  })
})
