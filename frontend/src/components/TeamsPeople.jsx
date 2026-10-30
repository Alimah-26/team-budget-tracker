import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createTeam, deleteTeam, getTeams, getUsers, renameTeam, updateUser } from '../api.js'
import { apiError, sortPeople, userChanges } from '../adminData.js'
import './Admin.css'

function PersonRow({ person, teams, busy, onSave }) {
  const [draft, setDraft] = useState({ team_id: person.team_id == null ? '' : String(person.team_id), role: person.role })
  const dirty = Object.keys(userChanges(person, draft)).length > 0
  return <tr>
    <td><strong>{person.full_name}</strong><small>{person.email}</small></td>
    <td><select aria-label={`Team for ${person.full_name}`} value={draft.team_id} disabled={busy} onChange={(event) => setDraft({ ...draft, team_id: event.target.value })}>
      <option value="">Not assigned</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
    </select></td>
    <td><select aria-label={`Role for ${person.full_name}`} value={draft.role} disabled={busy} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>
      <option value="employee">Employee · read only</option><option value="admin">Admin · manage budgets</option>
    </select></td>
    <td>{person.role === 'admin' ? 'All teams' : person.team_id == null ? 'Awaiting access' : 'Own team only'}</td>
    <td><button disabled={busy || !dirty} onClick={() => onSave(person, draft)}>Save</button></td>
  </tr>
}

function DeleteTeamDialog({ team, busy, error, onConfirm, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={ref} className="admin-dialog" aria-labelledby="delete-team-heading" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <h2 id="delete-team-heading">Delete {team.name}?</h2>
    <p>This permanently deletes the team, its budgets, and their line items. Assigned users will become unassigned. This cannot be undone.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="admin-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete team and budgets'}</button></div>
  </dialog>
}

export default function TeamsPeople({ user, onBusyChange, onAccountChanged }) {
  const [teams, setTeams] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [teamDraft, setTeamDraft] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)
  const pending = useRef(false)
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    if (user.role !== 'admin') return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [teamResponse, users] = await Promise.all([getTeams(), getUsers()])
        if (!cancelled) { setTeams(teamResponse.teams); setPeople(sortPeople(users)) }
      } catch (failure) {
        if (!cancelled) setError(apiError(failure))
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [revision, user.role])

  if (user.role !== 'admin') return null

  async function mutate(action, message, after) {
    if (pending.current) return false
    pending.current = true
    setBusy(true); onBusyChange(true); setError(''); setNotice('')
    try {
      await action()
      if (!active.current) return false
      setNotice(message)
      setRevision((value) => value + 1)
      after?.()
      return true
    } catch (failure) {
      if (active.current) setError(apiError(failure))
      return false
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
      onBusyChange(false)
    }
  }

  async function saveTeam(event) {
    event.preventDefault()
    const name = teamDraft.name.trim()
    if (!name) { setError('Enter a team name.'); return }
    const editing = teamDraft.id != null
    const saved = await mutate(
      () => editing ? renameTeam(teamDraft.id, name) : createTeam(name),
      editing ? 'Team renamed.' : 'Team created.',
    )
    if (saved && active.current) setTeamDraft(null)
  }

  async function savePerson(person, draft) {
    const changes = userChanges(person, draft)
    if (!Object.keys(changes).length) return
    await mutate(() => updateUser(person.id, changes), `${person.full_name}’s access updated.`, () => {
      if (person.id === user.id) onAccountChanged()
    })
  }

  async function removeTeam() {
    const target = deleteTarget
    await mutate(() => deleteTeam(target.id), 'Team deleted. Its employees are now unassigned.', () => {
      setDeleteTarget(null)
      if (target.id === user.team_id) onAccountChanged()
    })
  }

  const waiting = people.filter((person) => person.role === 'employee' && person.team_id == null)
  const visiblePeople = onlyUnmapped ? waiting : people
  const disabled = loading || busy

  return <main className="admin-page" aria-busy={loading || busy}>
    <header className="admin-heading"><div><h1>Teams & people</h1></div><button disabled={disabled} onClick={() => { setTeamDraft({ id: null, name: '' }); setError('') }}><Plus size={16} /> Add team</button></header>
    {error && !deleteTarget && <p className="admin-error" role="alert">{error} <button disabled={disabled} onClick={() => setRevision((value) => value + 1)}>Retry loading</button></p>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {loading && <p role="status">Loading teams and people…</p>}
    {busy && <p role="status">Saving changes…</p>}
    {teamDraft && <form className="admin-panel" onSubmit={saveTeam}>
      <h2>{teamDraft.id == null ? 'Create team' : 'Rename team'}</h2>
      <label>Team name<input required maxLength={100} disabled={disabled} value={teamDraft.name} onChange={(event) => setTeamDraft({ ...teamDraft, name: event.target.value })} /></label>
      <div className="admin-actions"><button type="button" disabled={busy} onClick={() => setTeamDraft(null)}>Cancel</button><button type="submit" disabled={disabled} className="admin-primary">Save team</button></div>
    </form>}
    <section className="admin-panel" aria-labelledby="teams-heading"><h2 id="teams-heading">Teams</h2><div className="admin-table-scroll"><table><thead><tr><th scope="col">Team</th><th scope="col">Assigned people</th><th scope="col">Actions</th></tr></thead><tbody>
      {teams.map((team) => <tr key={team.id}><td>{team.name}</td><td>{people.filter((person) => person.team_id === team.id).length}</td><td><div className="admin-actions"><button disabled={disabled} onClick={() => { setTeamDraft({ id: team.id, name: team.name }); setError('') }} aria-label={`Rename ${team.name}`}><Pencil size={15} /> Rename</button><button disabled={disabled} onClick={() => { setDeleteTarget(team); setError('') }} aria-label={`Delete ${team.name}`}><Trash2 size={15} /> Delete</button></div></td></tr>)}
      {!loading && !teams.length && <tr><td colSpan={3}>No teams yet. Create a team above.</td></tr>}
    </tbody></table></div></section>
    <section className="admin-panel" aria-labelledby="people-heading"><div className="admin-heading"><div><h2 id="people-heading">People & access <span className="admin-count">{waiting.length} unassigned</span></h2></div><label className="admin-checkbox"><input type="checkbox" checked={onlyUnmapped} onChange={(event) => setOnlyUnmapped(event.target.checked)} /> Only unassigned employees</label></div>
      <div className="admin-table-scroll"><table><thead><tr><th scope="col">Person</th><th scope="col">Team</th><th scope="col">Role</th><th scope="col">Current access</th><th scope="col">Action</th></tr></thead><tbody>
        {visiblePeople.map((person) => <PersonRow key={`${person.id}:${person.team_id}:${person.role}`} person={person} teams={teams} busy={disabled} onSave={savePerson} />)}
        {!loading && !visiblePeople.length && <tr><td colSpan={5}>{onlyUnmapped ? 'No employees are awaiting assignment.' : 'People will appear here after signing in.'}</td></tr>}
      </tbody></table></div>
    </section>
    {deleteTarget && <DeleteTeamDialog team={deleteTarget} busy={busy} error={error} onConfirm={removeTeam} onClose={() => setDeleteTarget(null)} />}
  </main>
}
