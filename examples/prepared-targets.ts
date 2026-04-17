import { prepare, search } from 'fuzzysort2'

const targets = [
  prepare('CheatManager.h'),
  prepare('Manifest.cpp'),
  prepare('CheatManager.cpp'),
]

console.log(search('c man', targets).items.map(item => item.target))
console.log(search('manifest', targets).items.map(item => item.target))
