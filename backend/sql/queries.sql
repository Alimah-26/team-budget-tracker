SELECT 
    t.id AS team_id,
    t.name AS team_name,
    li.currency,
    COALESCE(SUM(li.amount), 0.00) AS total_amount
FROM teams t
LEFT JOIN budgets b ON t.id = b.team_id AND b.period = '2026-Q4'
LEFT JOIN line_items li ON b.id = li.budget_id
GROUP BY t.id, t.name, li.currency
ORDER BY t.name, li.currency;


SELECT 
    li.id,
    li.code,
    li.amount,
    li.currency,
    li.description,
    li.purpose,
    li.source,
    li.created_at
FROM line_items li
JOIN budgets b ON li.budget_id = b.id
WHERE b.team_id = 1 AND b.period = '2026-Q4'
ORDER BY li.code ASC;

WITH ranked_items AS (
    SELECT 
        t.name AS team_name,
        li.code,
        li.amount,
        li.currency,
        li.description,
        ROW_NUMBER() OVER (
            PARTITION BY li.currency 
            ORDER BY li.amount DESC
        ) AS rank
    FROM line_items li
    JOIN budgets b ON li.budget_id = b.id
    JOIN teams t ON b.team_id = t.id
    WHERE b.period = '2026-Q4'
)
SELECT team_name, code, amount, currency, description
FROM ranked_items
WHERE rank <= 3;

SELECT 
    li.id,
    li.code,
    li.amount,
    li.currency,
    li.description,
    li.purpose
FROM line_items li
JOIN budgets b ON li.budget_id = b.id
WHERE b.period = '2026-Q4'
  AND (
      li.code ILIKE 'CW1%' 
      OR li.description ILIKE '%server%' 
      OR li.purpose ILIKE '%testing%'
  );


WITH current_period AS (
    SELECT 
        li.currency,
        COALESCE(SUM(li.amount), 0.00) AS current_total
    FROM line_items li
    JOIN budgets b ON li.budget_id = b.id
    WHERE b.team_id = 1 AND b.period = '2026-Q4'
    GROUP BY li.currency
),
previous_period AS (
    SELECT 
        li.currency,
        COALESCE(SUM(li.amount), 0.00) AS previous_total
    FROM line_items li
    JOIN budgets b ON li.budget_id = b.id
    WHERE b.team_id = 1 AND b.period = '2026-Q3'
    GROUP BY li.currency
)
SELECT 
    COALESCE(c.currency, p.currency) AS currency,
    COALESCE(c.current_total, 0.00) AS current_amount,
    COALESCE(p.previous_total, 0.00) AS previous_amount,
    (COALESCE(c.current_total, 0.00) - COALESCE(p.previous_total, 0.00)) AS difference
FROM current_period c
FULL OUTER JOIN previous_period p ON c.currency = p.currency;