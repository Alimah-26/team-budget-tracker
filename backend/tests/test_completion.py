from datetime import timedelta
from decimal import Decimal

import psycopg
import pytest

from app.core import security


def test_currencies_endpoint_uses_the_validated_registry(client, as_user):
    as_user('employee')
    response = client.get('/api/currencies')
    assert response.status_code == 200
    codes = {row['code'] for row in response.json()}
    assert {'NGN', 'USD', 'EUR', 'GBP'} <= codes
    assert not {'ZZZ', 'XXX', 'XTS'} & codes


@pytest.mark.parametrize('method,path,payload', [
    ('post', '/api/budgets/1/line-items', {'code': 'A', 'description': 'D', 'purpose': 'P', 'amount': '1', 'currency': 'ZZZ'}),
    ('patch', '/api/line-items/1', {'currency': 'ZZZ'}),
])
def test_unknown_iso_currency_is_rejected(client, as_user, method, path, payload):
    as_user()
    assert getattr(client, method)(path, json=payload).status_code == 422


def test_csv_rejects_unknown_iso_currency(client, as_user, cursor):
    as_user()
    response = client.post('/api/budgets/1/line-items/import', params={'dry_run': True}, files={
        'file': ('budget.csv', 'code,amount,currency,description,purpose\nA,1,ZZZ,D,P\n', 'text/csv'),
    })
    assert response.status_code == 200
    assert response.json()['success'] is False
    assert 'Unsupported currency' in response.json()['errors'][0]['error']
    cursor.executemany.assert_not_called()


def test_canonical_line_item_creation(client, as_user, cursor):
    as_user()
    cursor.fetchone.side_effect = [(1,), (2, 1, 'A', 'Tool', 'Planning', Decimal('1.00'), 'NGN')]
    response = client.post('/api/budgets/1/line-items', json={
        'code': 'A', 'description': 'Tool', 'purpose': 'Planning', 'amount': '1.00', 'currency': 'ngn',
    })
    assert response.status_code == 201, response.text
    assert response.json()['budget_id'] == 1
    assert response.json()['currency'] == 'NGN'


@pytest.mark.parametrize('role,expected', [('admin', 200), ('employee', 403)])
def test_csv_template_download_permissions(client, as_user, role, expected):
    as_user(role)
    response = client.get('/api/line-items/template')
    assert response.status_code == expected
    if expected == 200:
        assert response.text == 'code,amount,currency,description,purpose\n'
        assert 'attachment' in response.headers['content-disposition']


def test_budget_creation_inserts_initial_items_before_committing(client, as_user, cursor, connection):
    as_user()
    cursor.fetchone.side_effect = [(2,), (9, 2, '2027-Q1')]
    response = client.post('/api/teams/2/budgets', json={
        'period': '2027-Q1', 'line_items': [
            {'code': 'A', 'description': 'D', 'purpose': 'P', 'amount': '0.10', 'currency': 'NGN'},
            {'code': 'B', 'description': 'D', 'purpose': 'P', 'amount': '0.20', 'currency': 'USD'},
        ],
    })
    assert response.status_code == 201, response.text
    inserted = cursor.executemany.call_args.args[1]
    assert inserted[0] == (9, 'A', 'D', 'P', Decimal('0.10'), 'NGN')
    assert inserted[1][4] == Decimal('0.20')
    connection.commit.assert_called_once()


def test_initial_item_failure_rolls_back_budget(client, as_user, cursor, connection):
    as_user()
    cursor.fetchone.side_effect = [(2,), (9, 2, '2027-Q1')]
    cursor.executemany.side_effect = psycopg.errors.CheckViolation('rejected')
    response = client.post('/api/teams/2/budgets', json={
        'period': '2027-Q1', 'line_items': [{'code': 'A', 'description': 'D', 'purpose': 'P', 'amount': '1', 'currency': 'NGN'}],
    })
    assert response.status_code == 422
    connection.commit.assert_not_called()
    connection.rollback.assert_called_once()


def test_duplicate_initial_codes_are_rejected_before_writes(client, as_user, cursor):
    as_user()
    row = {'code': 'A', 'description': 'D', 'purpose': 'P', 'amount': '1', 'currency': 'NGN'}
    response = client.post('/api/teams/2/budgets', json={'period': '2027-Q1', 'line_items': [row, row]})
    assert response.status_code == 422
    cursor.execute.assert_not_called()


def test_zero_lifetime_is_not_replaced_by_default_lifetime():
    token = security.create_access_token({'sub': '1'}, expires_delta=timedelta(0))
    with pytest.raises(Exception) as error:
        security.decode_access_token(token)
    assert error.value.status_code == 401
