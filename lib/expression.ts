const TOKENS = /\d+\.?\d*|\.\d+|[-+*/]/g

/**
 * Evaluate arithmetic typed into a number field, such as `0.5+0.1*2`.
 * Returns `undefined` unless the result is a finite number.
 */
export function evaluate(input: string): number | undefined {
  const source = input.replaceAll(/\s/g, '').replaceAll(',', '.')
  const tokens = source.match(TOKENS) ?? []
  if (tokens.join('') !== source) return undefined
  let position = 0

  function operand(): number {
    const token = tokens[position++]
    if (token === '-') return -operand()
    if (token === '+') return operand()
    return Number(token)
  }

  function product(): number {
    let result = operand()
    while (tokens[position] === '*' || tokens[position] === '/') {
      result =
        tokens[position++] === '*' ? result * operand() : result / operand()
    }
    return result
  }

  let result = product()
  while (tokens[position] === '+' || tokens[position] === '-') {
    result =
      tokens[position++] === '+' ? result + product() : result - product()
  }
  return position === tokens.length && Number.isFinite(result)
    ? result
    : undefined
}
