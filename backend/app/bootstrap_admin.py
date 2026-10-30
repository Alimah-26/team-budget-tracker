"""Explicitly create or promote a company account without changing its team."""
import argparse
import re

import psycopg

from app.core.config import COMPANY_DOMAIN, DATABASE_URL


def bootstrap_admin(conn, email, full_name=None):
    email = email.strip().lower()
    local, separator, domain = email.partition('@')
    if not separator or domain != COMPANY_DOMAIN or not re.fullmatch(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+", local):
        raise ValueError(f'Use a complete @{COMPANY_DOMAIN} email address')
    matches = conn.execute('SELECT id FROM users WHERE lower(email) = %s FOR UPDATE', (email,)).fetchall()
    if len(matches) > 1:
        raise ValueError('Multiple accounts match this email; resolve the duplicate before granting access')
    if matches:
        return conn.execute("UPDATE users SET role = 'admin' WHERE id = %s RETURNING id, email, role", (matches[0][0],)).fetchone()
    return conn.execute(
        """INSERT INTO users (email, full_name, role) VALUES (%s, %s, 'admin')
           ON CONFLICT (email) DO UPDATE SET role = 'admin' RETURNING id, email, role""",
        (email, full_name or local.replace('.', ' ').title()),
    ).fetchone()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email', required=True)
    parser.add_argument('--name')
    args = parser.parse_args()
    with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
        account = bootstrap_admin(conn, args.email, args.name)
    print(f'{account[1]} is an admin (user {account[0]})')


if __name__ == '__main__':
    main()
