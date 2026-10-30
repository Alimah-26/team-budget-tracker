import { getBudgetSummary, getCurrencies, getLineItems, getTeamBudget, getTeams } from './api.js'

export function lineItemPayload(draft, forUpdate = false) {
  const fields = {
    code: draft.code.trim(), description: draft.description.trim(),
    purpose: draft.purpose.trim(), amount: draft.amount,
    currency: draft.currency.trim().toUpperCase(),
  }
  return forUpdate ? fields : { budget_id: Number(draft.budget_id), ...fields }
}

export async function loadDashboardData({ user, period, selectedTeam, search }) {
  if (user.role !== 'admin' && user.team_id == null) {
    return { teams: [], summaries: [], items: [], count: 0, currencies: [] }
  }

  const [teamResponse, currencies] = await Promise.all([getTeams(), getCurrencies()])
  const teams = teamResponse.teams
  let summaries
  let employeeBudget

  if (user.role === 'admin') {
    const response = await getBudgetSummary(period)
    summaries = response.summaries.filter((summary) =>
      selectedTeam === null || String(summary.team_id) === String(selectedTeam),
    )
  } else {
    const team = teams.find((row) => row.id === user.team_id)
    try {
      employeeBudget = await getTeamBudget(user.team_id, period)
    } catch (error) {
      if (error.response?.status !== 404) throw error
    }
    const base = { team_id: user.team_id, team_name: team?.name || user.team_name || 'Your team', budget_id: employeeBudget?.id ?? null }
    summaries = employeeBudget?.totals.length
      ? employeeBudget.totals.map((row) => ({ ...base, ...row }))
      : [{ ...base, currency: null, total_amount: '0.00' }]
  }

  const ids = [...new Set(summaries.map((row) => row.budget_id).filter((id) => id != null))]
  const results = await Promise.all(ids.map(async (id) => {
    const all = employeeBudget?.id === id
      ? employeeBudget.line_items : (await getLineItems(id, '')).line_items
    const matches = search.trim() ? (await getLineItems(id, search.trim())).line_items : all
    return { items: matches, count: all.length }
  }))
  return {
    teams: user.role === 'admin' ? teams : teams.filter((team) => team.id === user.team_id),
    summaries,
    items: results.flatMap((result) => result.items).sort((a, b) => a.code.localeCompare(b.code)),
    count: results.reduce((count, result) => count + result.count, 0),
    currencies: currencies.map((row) => row.code),
  }
}
