import * as _ from 'lodash'

export function getValueAtPath(obj: any, path: string) {
  const bits = _.toPath(path)
  let v = obj
  let p = bits.shift()
  while (bits.length) {
    if (_.has(v, p)) {
      v = v[p]
      p = bits.shift()
    } else {
      return undefined
    }
  }
  return v[p]
}

/**
 * Supports using "*" to return an array of items.
 *
 * "path.to.array.*" => <items of collection>
 * "path.to.array.*.path.in.item" => <extract value from each item in collection>
 *
 * @param {*} obj
 * @param {*} path
 */
export function getValueAtPathWithArraySupport(obj: any, path: string) {
  let result

  if (path.includes('*')) {
    // this regex supports "before.*.after", "before.*" and "*.after", with the caveat
    // that we have to remove dots by hand to get usable paths.
    const matches = path.match(/^(.+\.)?\*(\..+)?$/)
    if (matches && matches.length === 3) {
      // remove dots where needed ...
      const pathToArray = matches[1] ? matches[1].substring(0, matches[1].length - 1) : ''
      const pathAfterArray = matches[2] ? matches[2].substring(1) : ''

      // if pathToArray is empty, the obj itself is the array
      let array = pathToArray.length ? getValueAtPath(obj, pathToArray) : obj

      // TODO: not sure why/where/how an object with prop '*' is being created. work this out.
      if (_.isObject(array) && _.isArray(array['*'])) {
        array = array['*']
      }

      if (!_.isArray(array)) { // console.log('---')
        // console.log({ path, pathToArray, obj, array })
        // console.log('---')
        throw new Error(`getValueAtPathWithArraySupport: Value at '${pathToArray}' is not an array. Passed path '${path}', obj ${JSON.stringify(obj, null, 2)}`)
      } else {
        result = array.map((item) => {
          if (pathAfterArray.length) {
            return getValueAtPath(item, pathAfterArray)
          }
          return item
        })
      }
    } else {
      throw new Error(`Unsupported array syntax in path '${path}'. Only a single array ".*." can be iterated over.`)
    }
  } else {
    result = getValueAtPath(obj, path)
  }
  return result
}