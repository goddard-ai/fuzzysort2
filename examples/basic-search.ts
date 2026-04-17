import { search } from 'fuzzysort2'

const result = search('c man', [
  'CheatManager.h',
  'Manifest.cpp',
  'CheatManager.cpp',
], { limit: 2 })

console.log(result.total)
console.log(result.items.map(item => item.target))
