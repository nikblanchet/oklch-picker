import { $, create, setCssVar, setText } from '../../lib/dom.ts'
import { getLook, PAIRS } from '../../lib/looks.ts'
import { WINNERS } from '../../lib/winners.ts'
import { observeLooks } from '../look/index.ts'

/** Cloud Dancer looks best in the third one. */
const FIRST_LOOK = 2

const template = $<HTMLTemplateElement>('#winner')

for (const [list, root] of [
  [$('#runway'), $('#runway')],
  [$('#archive'), null]
] as const) {
  const observe = observeLooks(root)
  let [singles, pairs] = [FIRST_LOOK, 0]
  for (const { colors, year } of WINNERS) {
    const item = template.content.cloneNode(true) as DocumentFragment
    const sketch = $('.look', item)
    setCssVar('--paint', colors[0][2], sketch)
    if (colors[1]) {
      setCssVar('--paint', colors[1][2], create('div', 'look_second', sketch))
    }
    observe(
      sketch,
      colors[1] ? PAIRS[pairs++ % PAIRS.length]! : getLook(singles++).name
    )
    for (const [, , hex] of colors) {
      setCssVar('--paint', hex, create('i', '', $('.winner_colors', item)))
    }
    setText(item, {
      '.winner_code': colors.map(i => i[1]).join(' + '),
      '.winner_name': colors.map(i => i[0]).join('\n+ '),
      '.winner_year': String(year)
    })
    list.append(item)
  }
}
