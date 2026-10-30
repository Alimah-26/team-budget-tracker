import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import api, { createBudget, createLineItem, deleteBudget, getBudgetSummary, getCurrentUser, updateLineItem } from '../src/api.js'
import { lineItemPayload, loadDashboardData } from '../src/dashboardData.js'
import { formatMoney, moneyToCents } from '../src/money.js'

const originalAdapter = api.defaults.adapter
let calls
const teams = [{ id: 1, name: 'Engineering' }, { id: 2, name: 'Finance' }]
const item = { id: 1, budget_id: 7, code: 'CW1', description: 'Hosting', purpose: 'Production', amount: '0.10', currency: 'NGN' }
const summaries = [
  { team_id: 1, team_name: 'Engineering', budget_id: 7, currency: 'NGN', total_amount: '0.10' },
  { team_id: 1, team_name: 'Engineering', budget_id: 7, currency: 'USD', total_amount: '0.20' },
  { team_id: 2, team_name: 'Finance', budget_id: null, currency: null, total_amount: '0.00' },
]

function mockApi(handle) {
  api.defaults.adapter = async (config) => {
    calls.push(config)
    const data = config.url === '/api/currencies' ? [{ code: 'NGN', name: 'Naira' }, { code: 'USD', name: 'US Dollar' }] : await handle(config)
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
}

beforeEach(() => {
  calls = []
  globalThis.localStorage = { getItem: () => 'test-token' }
})
afterEach(() => { api.defaults.adapter = originalAdapter; delete globalThis.localStorage })

test('current user and summary use the backend routes and Bearer header', async () => {
  mockApi(() => ({ role: 'admin' }))
  await getCurrentUser()
  await getBudgetSummary('2026-Q4')
  assert.deepEqual(calls.map((call) => call.url), ['/api/me', '/api/summary'])
  assert.equal(calls[1].params.period, '2026-Q4')
  assert.equal(calls[0].headers.Authorization, 'Bearer test-token')
})

test('admin data loads every budget only once even with multiple currencies', async () => {
  mockApi((config) => {
    if (config.url === '/api/teams') return { teams }
    if (config.url === '/api/summary') return { summaries }
    if (config.url === '/api/line-items') return { line_items: [item] }
    throw new Error(`Unexpected request: ${config.url}`)
  })
  const result = await loadDashboardData({ user: { role: 'admin' }, period: '2026-Q4', selectedTeam: null, search: '' })
  assert.equal(result.count, 1)
  assert.equal(result.summaries.length, 3)
  assert.equal(calls.filter((call) => call.url === '/api/line-items').length, 1)
})

test('employees use their own budget endpoint and never request the admin summary', async () => {
  mockApi((config) => {
    if (config.url === '/api/teams') return { teams: [teams[0]] }
    if (config.url === '/api/teams/1/budgets/2026-Q4') return { id: 7, line_items: [item], totals: [{ currency: 'NGN', total_amount: '0.10' }] }
    throw new Error(`Employee must not call ${config.url}`)
  })
  const result = await loadDashboardData({ user: { role: 'employee', team_id: 1 }, period: '2026-Q4', selectedTeam: null, search: '' })
  assert.equal(result.count, 1)
  assert.equal(result.summaries[0].budget_id, 7)
  assert.equal(result.summaries[0].team_name, 'Engineering')
})

test('missing employee budget is an empty state; permission errors still propagate', async () => {
  for (const status of [404, 403]) {
    mockApi((config) => {
      if (config.url === '/api/teams') return { teams: [teams[0]] }
      throw { response: { status } }
    })
    const options = { user: { role: 'employee', team_id: 1 }, period: '2026-Q4', selectedTeam: null, search: '' }
    if (status === 404) {
      const result = await loadDashboardData(options)
      assert.equal(result.count, 0)
      assert.equal(result.summaries[0].budget_id, null)
    } else await assert.rejects(loadDashboardData(options), (error) => error.response.status === 403)
  }
})

test('unmapped employees do not fetch budget data', async () => {
  mockApi(() => { throw new Error('No request expected') })
  const result = await loadDashboardData({ user: { role: 'employee', team_id: null } })
  assert.deepEqual(result.items, [])
  assert.equal(calls.length, 0)
})

test('team filtering and search preserve full counts and summary totals', async () => {
  mockApi((config) => {
    if (config.url === '/api/teams') return { teams }
    if (config.url === '/api/summary') return { summaries }
    if (config.url === '/api/line-items') return { line_items: config.params.search ? [] : [item] }
    throw new Error('Unexpected route')
  })
  const result = await loadDashboardData({ user: { role: 'admin' }, period: '2026-Q4', selectedTeam: '1', search: 'unmatched' })
  assert.deepEqual(result.items, [])
  assert.equal(result.count, 1)
  assert.equal(result.summaries[0].total_amount, '0.10')
  assert.equal(result.teams.length, 2)
})

test('create and edit send decimal amounts and omit response-only fields', async () => {
  mockApi(() => ({}))
  const draft = { ...item, budget_id: '7', source: 'manual', amount: '123456789.12' }
  await createLineItem(lineItemPayload(draft))
  await updateLineItem(1, lineItemPayload(draft, true))
  const created = JSON.parse(calls[0].data)
  const edited = JSON.parse(calls[1].data)
  assert.equal(created.amount, '123456789.12')
  assert.equal(calls[0].url, '/api/budgets/7/line-items')
  assert.ok(!('budget_id' in created))
  assert.equal(edited.amount, '123456789.12')
  for (const key of ['id', 'source']) assert.ok(!(key in created) && !(key in edited))
  assert.ok(!('budget_id' in edited))
  assert.equal(calls[1].method, 'patch')
})

test('budget creation places team in URL and period in body', async () => {
  mockApi(() => ({}))
  await createBudget(2, '2026-Q4')
  assert.equal(calls[0].url, '/api/teams/2/budgets')
  assert.deepEqual(JSON.parse(calls[0].data), { period: '2026-Q4' })
})

test('initial budget items retain decimal strings in one creation request', async () => {
  mockApi(() => ({}))
  const rows = [{ code: 'INIT', amount: '0.10', currency: 'NGN', description: 'Hosting', purpose: 'Production' }]
  await createBudget(2, '2026-Q4', rows)
  assert.equal(calls.length, 1)
  assert.deepEqual(JSON.parse(calls[0].data), { period: '2026-Q4', line_items: rows })
})

test('budget deletion targets the selected budget', async () => {
  mockApi(() => ({}))
  await deleteBudget(7)
  assert.equal(calls[0].method, 'delete')
  assert.equal(calls[0].url, '/api/budgets/7')
})

test('money totals retain exact cents including large sums', () => {
  assert.equal(moneyToCents('0.10') + moneyToCents('0.20'), 30n)
  assert.match(formatMoney(30n, 'USD'), /0[.,]30/)
  assert.match(formatMoney('9999999999999.99', 'NGN'), /999/)
  assert.throws(() => moneyToCents('NaN'))
})
