import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import api, { createTeam, deleteTeam, getUsers, importLineItems, renameTeam, updateUser } from '../src/api.js'
import { canConfirmImport, importBudgets, sortPeople, userChanges } from '../src/adminData.js'
import { csvPreview } from '../src/csvPreview.js'

const originalAdapter = api.defaults.adapter
let calls
beforeEach(() => {
  calls = []
  globalThis.localStorage = { getItem: () => 'test-token' }
  api.defaults.adapter = async (config) => {
    calls.push(config)
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config }
  }
})
afterEach(() => { api.defaults.adapter = originalAdapter; delete globalThis.localStorage })

test('CSV uploads use multipart files with explicit dry-run and confirmation requests', async () => {
  const file = new File(['code,amount,currency,description,purpose\nA,1,NGN,D,P\n'], 'budget.csv', { type: 'text/csv' })
  await importLineItems(7, file)
  await importLineItems(7, file, false)
  assert.equal(calls[0].url, '/api/budgets/7/line-items/import')
  assert.deepEqual(calls[0].params, { dry_run: true })
  assert.deepEqual(calls[1].params, { dry_run: false })
  assert.ok(calls[0].data instanceof FormData)
  assert.equal(calls[0].data.get('file').name, 'budget.csv')
  assert.equal(await calls[0].data.get('file').text(), await file.text())
  assert.equal(calls[0].headers.Authorization, 'Bearer test-token')
})

test('import confirmation requires a successful preview of the exact file and budget', () => {
  const file = new File(['test'], 'budget.csv')
  const report = { success: true, dry_run: true, total_rows: 2, errors: [] }
  const preview = { report, file, budgetId: '7' }
  assert.equal(canConfirmImport(preview, file, '7'), true)
  assert.equal(canConfirmImport(preview, new File(['test'], 'budget.csv'), '7'), false)
  assert.equal(canConfirmImport(preview, file, '8'), false)
  for (const changes of [{ success: false }, { dry_run: false }, { total_rows: 0 }, { errors: [{ row: 2, error: 'Invalid' }] }]) {
    assert.equal(canConfirmImport({ ...preview, report: { ...report, ...changes } }, file, '7'), false)
  }
})

test('import budget options deduplicate currencies and retain empty budgets', () => {
  const options = importBudgets([
    { budget_id: 7, team_id: 1, team_name: 'Engineering', currency: 'NGN' },
    { budget_id: 7, team_id: 1, team_name: 'Engineering', currency: 'USD' },
    { budget_id: null, team_id: 2, team_name: 'Finance', currency: null },
    { budget_id: 8, team_id: 3, team_name: 'Marketing', currency: null },
  ])
  assert.deepEqual(options.map((row) => row.id), [7, 8])
})

test('people updates distinguish omitted teams from unassignment and preserve unchanged roles', () => {
  const person = { team_id: 2, role: 'employee' }
  assert.deepEqual(userChanges(person, { team_id: '', role: 'employee' }), { team_id: null })
  assert.deepEqual(userChanges(person, { team_id: '2', role: 'admin' }), { role: 'admin' })
  assert.deepEqual(userChanges(person, { team_id: '3', role: 'admin' }), { team_id: 3, role: 'admin' })
  assert.deepEqual(userChanges(person, { team_id: '2', role: 'employee' }), {})
  assert.throws(() => userChanges(person, { team_id: '-1', role: 'employee' }))
})

test('team and people mutations match the backend endpoint contract', async () => {
  await createTeam('Engineering')
  await renameTeam(2, 'Finance')
  await deleteTeam(3)
  await updateUser(5, { team_id: null })
  await getUsers(true)
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['post', '/api/teams'], ['patch', '/api/teams/2'], ['delete', '/api/teams/3'],
    ['patch', '/api/users/5'], ['get', '/api/users'],
  ])
  assert.deepEqual(JSON.parse(calls[0].data), { name: 'Engineering' })
  assert.deepEqual(JSON.parse(calls[1].data), { name: 'Finance' })
  assert.deepEqual(JSON.parse(calls[3].data), { team_id: null })
  assert.equal(calls[4].params.unmapped, true)
})

test('unmapped employees appear before assigned employees and admins', () => {
  const people = [
    { id: 1, full_name: 'Admin', role: 'admin', team_id: null },
    { id: 2, full_name: 'Assigned', role: 'employee', team_id: 1 },
    { id: 3, full_name: 'Waiting', role: 'employee', team_id: null },
  ]
  assert.equal(sortPeople(people)[0].id, 3)
  assert.equal(people[0].id, 1)
})

test('CSV preview displays quoted commas, escaped quotes, BOM and multiline purposes', () => {
  const result = csvPreview('\uFEFFcode,description,purpose\r\nA,"Cloud, hosting","A ""quoted""\nreason"\r\n')
  assert.deepEqual(result.headers, ['code', 'description', 'purpose'])
  assert.deepEqual(result.rows[0], ['A', 'Cloud, hosting', 'A "quoted"\nreason'])
  assert.equal(result.total, 1)
})

test('CSV preview limits displayed rows without limiting the server validation count', () => {
  const result = csvPreview('code\n' + Array.from({ length: 150 }, (_, index) => `A${index}\n`).join(''))
  assert.equal(result.rows.length, 100)
  assert.equal(result.total, 150)
})
