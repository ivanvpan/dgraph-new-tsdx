import isObject from 'lodash/isObject'
import isArray from 'lodash/isArray'
import flattenDeep from 'lodash/flattenDeep'
import isUndefined from 'lodash/isUndefined'
import isBoolean from 'lodash/isBoolean'
import isString from 'lodash/isString'
import isNull from 'lodash/isNull'
import values from 'lodash/values'
import merge from 'lodash/merge'
import pick from 'lodash/pick'
import omit from 'lodash/omit'
import mapValues from 'lodash/mapValues'
import { getValueAtPath } from './path-utils'

/**
 * Try to extract an array of values from arguments to the
 * xxxN functions.
 *
 * Bit cheesy to accept all these variants.
 *
 * @param {*} items
 */
const extractNItems = (items) => {
  let result = items
  if (isObject(items)) {
    result = flattenDeep(values(items))
  }
  if (isArray(items)) {
    result = flattenDeep(items)
  }
  return result
}

// yuck :(
const vectorOpFnArgs = (fn, a, b) => {
  let result: any = { a, b }
  if (['addFactor', 'subFactor', 'mult'].includes(fn)) {
    result = { amt: a, factor: b }
  } else if (fn === 'div') {
    result = { num: a, dem: b }
  }
  return result
}


// optionally accept a value; if undefined assume `true`
const _filterFn = ({ path, value }) => item => !!(getValueAtPath(item, path) === (isUndefined(value) ? true : value))
const _filterNotFn = ({ path, value }) => item => !(getValueAtPath(item, path) === (isUndefined(value) ? true : value))

const transforms = {
  addN: items => extractNItems(items).reduce((t, a) => t + a, 0),
  andN: items => extractNItems(items).reduce((t, v) => !!t && !!v, true),
  orN: items => extractNItems(items).reduce((t, v) => t || v, false),
  concat: items => extractNItems(items).reduce((t, a) => t + a, ''),
  concatArrays: items => extractNItems(items).reduce((t, a) => t.concat(a), []),
  filter: ({ collection, path, value }) => extractNItems(collection).filter(_filterFn({ path, value })),
  filterNot: ({ collection, path, value }) => extractNItems(collection).filter(_filterNotFn({ path, value })),
  find: ({ collection, propName, propValue }) => extractNItems(collection).find(item => item[propName] === propValue),

  not: ({ item }) => isBoolean(item) && !item,
  ternary: ({ test, pass, fail }) => (test ? pass : fail),
  add: ({ a, b }) => a + b,
  sub: ({ a, b }) => a - b,
  addFactor: ({ amt, factor }) => amt + (amt * factor),
  subFactor: ({ amt, factor }) => amt - (amt * factor),
  mult: ({ amt, factor }) => amt * factor,
  div: ({ num, dem }) => num / dem,
  round: ({ amt }) => Math.round(amt),
  ceil: ({ amt }) => Math.ceil(amt),
  floor: ({ amt }) => Math.floor(amt),
  max: ({ a, b }) => Math.max(a, b),
  min: ({ a, b }) => Math.min(a, b),
  gt: ({ a, b }) => !!(a > b),
  lt: ({ a, b }) => !!(a < b),
  gte: ({ a, b }) => !!(a >= b),
  lte: ({ a, b }) => !!(a <= b),
  eq: ({ a, b }) => !!(a === b),
  clamp: ({ amt, min, max }) => Math.max(min, Math.min(max, amt)),
  roundCurrency: ({ amt }) => {
    let r = amt
    try { r = Number(amt.toFixed(2)) } catch (error) { console.log(`unable to round ${amt}`) } // eslint-disable-line no-console
    return r
  },
  includes: ({ item, isIncludedIn }) => isIncludedIn.includes(item),
  isNonEmptyString: ({ item }) => !!item && isString(item) && item.trim().length > 0,
  isNull: ({ item }) => isNull(item),

  map: ({ collection, fn, params }) => collection.map((item) => {
    const args = mapValues(params, localPath => localPath === '_item_' ? item : getValueAtPath(item, localPath))
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return transforms[fn](args)
  }),

  vectorOp: ({ collectionA, collectionB, op }) => {
    const result = []
    const cA = extractNItems(collectionA)
    const cB = extractNItems(collectionB)
    if (cA.length !== cB.length) {
      throw new Error(`vectorOp error: collections must be equal in length. Got a: ${cA.length}, b: ${cB.length}.`)
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (!(op in transforms)) {
      throw new Error(`vectorOp error: op '${op}' not found`)
    }
    cA.forEach((a, i) => {
      const b = cB[i]
      const args = vectorOpFnArgs(op, a, b)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      result.push(transforms[op](args))
    })
    return result
  },

  pick: ({ src, propNames }) => pick(src, propNames),
  omit: ({ src, propNames }) => omit(src, propNames),
  merge: ({ a, b }) => merge({}, a, b),
  box: ({ value, propName }) => ({ [propName]: value }),

  // note currently can't get path values for a nested array of paths, so can only add one prop at a time.
  addProp: ({ src, propName, propValue }) => merge({}, src, { [propName]: propValue }),
}

export default transforms