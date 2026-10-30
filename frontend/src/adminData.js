export function apiError(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ')
  return 'Unable to complete the request. Check your connection and try again.'
}

export function importBudgets(summaries) {
  return [...new Map(summaries.filter((row) => row.budget_id != null)
    .map((row) => [row.budget_id, { id: row.budget_id, teamId: row.team_id, teamName: row.team_name }])).values()]
    .sort((a, b) => a.teamName.localeCompare(b.teamName))
}

export function canConfirmImport(preview, file, budgetId) {
  const report = preview?.report
  return Boolean(file && budgetId && preview?.file === file && preview.budgetId === budgetId &&
    report?.success === true && report.dry_run === true && report.total_rows > 0 &&
    Array.isArray(report.errors) && report.errors.length === 0)
}

export function userChanges(person, draft) {
  const teamId = draft.team_id === '' ? null : Number(draft.team_id)
  if (teamId !== null && (!Number.isInteger(teamId) || teamId <= 0)) throw new Error('Choose a valid team.')
  if (!['admin', 'employee'].includes(draft.role)) throw new Error('Choose a valid role.')
  const changes = {}
  if (teamId !== person.team_id) changes.team_id = teamId
  if (draft.role !== person.role) changes.role = draft.role
  return changes
}

export function sortPeople(people) {
  return [...people].sort((a, b) => {
    const aWaiting = a.role === 'employee' && a.team_id == null
    const bWaiting = b.role === 'employee' && b.team_id == null
    return Number(bWaiting) - Number(aWaiting) || a.full_name.localeCompare(b.full_name)
  })
}
