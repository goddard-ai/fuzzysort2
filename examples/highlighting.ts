import { highlight, match, segments } from 'fuzzysort2'

const result = match('cman', 'CheatManager')

if (result) {
  console.log(segments(result))
  console.log(highlight(result))
  console.log(highlight(result, { open: '<b>', close: '</b>' }))
}
