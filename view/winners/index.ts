import { $, create, setCssVar, setText } from '../../lib/dom.ts'
import { cast } from '../../lib/looks.ts'
import { WINNERS } from '../../lib/winners.ts'
import { observeLooks } from '../look/index.ts'

const looks = cast(WINNERS.map(i => i.colors.length))
const template = $<HTMLTemplateElement>('#winner')

for (const [list, root] of [
  [$('#runway'), $('#runway')],
  [$('#archive'), null]
] as const) {
  const observe = observeLooks(root)
  for (const [index, { colors, year }] of WINNERS.entries()) {
    const item = template.content.cloneNode(true) as DocumentFragment
    const sketch = $('.look', item)
    setCssVar('--paint', colors[0][2], sketch)
    if (colors[1]) {
      setCssVar('--paint', colors[1][2], create('div', 'look_second', sketch))
    }
    observe(sketch, looks[index]!)
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
