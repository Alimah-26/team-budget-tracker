// Claims select the UI only. The API must enforce permissions and verify JWTs.
export function sessionFromToken(token, now = Date.now()) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')),
      (character) => character.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    if (!['admin', 'employee'].includes(claims.role) || !claims.sub ||
        typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
    if (claims.team_id != null && (!Number.isInteger(claims.team_id) || claims.team_id <= 0)) return null
    return {
      token,
      user: { id: claims.sub, email: claims.email, role: claims.role, team_id: claims.team_id ?? null },
    }
  } catch {
    return null
  }
}

export function readSession() {
  const token = localStorage.getItem('token')
  return token ? sessionFromToken(token) : null
}
