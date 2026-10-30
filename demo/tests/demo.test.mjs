import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cents, decimal, freshDemo, money, parseCsv, previewImport, total, validateItem,
  SAMPLE_CSV, INVALID_CSV, TEMPLATE,
} from '../src/model.js'

test('sample data has exact, separate currency totals for the selected period', () => {
  const data = freshDemo()
  const budgets = data.budgets.filter((budget) => budget.period === '2026-Q4')
  const items = data.items.filter((item) => budgets.some((budget) => budget.id === item.budget_id))
  assert.equal(total(items, 'NGN'), '14600000.00')
  assert.equal(total(items, 'USD'), '7600.00')
  assert.equal(data.teams.length - budgets.length, 1)
})

test('money uses integer cents and formats totals beyond individual item limits', () => {
  assert.equal(cents('0.10') + cents('0.20'), 30n)
  assert.equal(decimal(30n), '0.30')
  assert.match(money('9999999999999.99', 'NGN'), /9,999,999,999,999\.99/)
})

test('manual item validation rejects invalid money and unsupported currencies', () => {
  const item = { budget_id: 1, code: 'NEW', description: 'Tool', purpose: 'Planning', amount: '1.00', currency: 'NGN' }
  for (const amount of ['0', '-1', 'NaN', 'Infinity', '1.234', '1000000000000']) {
    assert.throws(() => validateItem({ ...item, amount }, []), undefined, amount)
  }
  assert.throws(() => validateItem({ ...item, currency: 'ZZZ' }, []), /supported currency/)
})

test('code uniqueness is per budget and editing an unchanged code works', () => {
  const item = freshDemo().items[0]
  assert.throws(() => validateItem({ ...item, code: 'cw10001' }, [item]), /already exists/)
  assert.doesNotThrow(() => validateItem({ ...item }, [item], item.id))
  assert.doesNotThrow(() => validateItem({ ...item, budget_id: 99 }, [item]))
})

test('CSV parser handles BOM, escaped quotes, quoted commas and multiline fields', () => {
  const rows = parseCsv('\uFEFFcode,description,purpose\r\nA,"Cloud, hosting","A ""quoted""\nreason"\r\n')
  assert.deepEqual(rows, [['code', 'description', 'purpose'], ['A', 'Cloud, hosting', 'A "quoted"\nreason']])
  assert.throws(() => parseCsv('a,b\n"unfinished'), /closing quote/)
  assert.throws(() => parseCsv('a,b\n"closed"oops,x'), /closing quote/)
})

test('good CSV previews without changing existing data; repeat imports are rejected', () => {
  const data = freshDemo()
  const before = JSON.stringify(data)
  const report = previewImport(SAMPLE_CSV, 1, data.items)
  assert.equal(report.length, 2)
  assert.ok(report.every((row) => !row.error && row.item.source === 'import'))
  assert.equal(JSON.stringify(data), before)
  const stored = report.map((row, index) => ({ ...row.item, id: 100 + index }))
  assert.ok(previewImport(SAMPLE_CSV, 1, [...data.items, ...stored]).every((row) => row.error))
})

test('bad CSV produces row errors for invalid money, currency, and short rows', () => {
  const report = previewImport(INVALID_CSV, 1, [])
  assert.equal(report.filter((row) => row.error).length, 2)
  assert.deepEqual(report.map((row) => row.row), [2, 3])
  assert.match(previewImport(`${TEMPLATE}ONE,50,NGN\n`, 1, [])[0].error, /Column count/)
})

test('CSV rejects duplicate codes in file, empty files and missing columns', () => {
  const repeated = `${TEMPLATE}A,1,NGN,Tool,Planning\nA,2,NGN,Tool,Planning\n`
  assert.match(previewImport(repeated, 1, [])[1].error, /already exists/)
  assert.throws(() => previewImport(TEMPLATE, 1, []), /no line items/)
  assert.throws(() => previewImport('code,amount\nA,1', 1, []), /headers/)
})

test('reset produces independent seed data', () => {
  const first = freshDemo()
  first.teams[0].name = 'Changed'
  first.items.splice(0, 2)
  assert.equal(freshDemo().teams[0].name, 'Engineering')
  assert.equal(freshDemo().items.length, 13)
})
