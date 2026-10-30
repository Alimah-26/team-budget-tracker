INSERT INTO teams (name) VALUES 
('Engineering'),
('Finance'),
('Marketing');

INSERT INTO users (google_sub, email, full_name, role, team_id) VALUES 
('sub_admin_1', 'admin@company.com', 'Admin User', 'admin', 2),
('sub_emp_1', 'dev1@company.com', 'Dev One', 'employee', 1),
('sub_emp_2', 'dev2@company.com', 'Unmapped Employee', 'employee', NULL);

UPDATE teams SET created_by = 1 WHERE id IN (1, 2, 3);

INSERT INTO budgets (team_id, period, created_by) VALUES 
(1, '2026-Q4', 1);

INSERT INTO line_items (budget_id, code, amount, currency, description, purpose, source) VALUES 
(1, 'CW10001', 1500000.00, 'NGN', 'AWS Server Costs', 'Production hosting servers', 'manual'),
(1, 'CW10002', 2500.00, 'USD', 'GitHub Enterprise', 'Version control subscription', 'manual'),
(1, 'CW10003', 450000.00, 'NGN', 'CI/CD Pipeline Runners', 'Automated testing infrastructure', 'import');