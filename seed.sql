-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('company_name', 'Your Company Name');
INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'AED');
INSERT OR IGNORE INTO settings (key, value) VALUES ('company_logo_url', '');

-- Default admin user (password: Admin@1234)
-- Change this immediately via Settings → Users after first login
INSERT OR IGNORE INTO users (name, email, password_hash, role)
VALUES ('Admin', 'admin@example.com', 'ZX8+YTXg4g+01o12WChVvg==:NJskjQtIhil9ycYEmwxQHHSNf7WlDfU0kkSSgyG+Z6s=', 'admin');

-- Categories
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (1,  'FEWA & Sewerage',  '#3b82f6', '⚡', 1);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (2,  'Internet',         '#8b5cf6', '🌐', 2);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (3,  'Mobile',           '#ec4899', '📱', 3);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (4,  'Maintenance',      '#f59e0b', '🔧', 4);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (5,  'Charity',          '#10b981', '❤️', 5);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (6,  'Car',              '#6b7280', '🚗', 6);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (7,  'Alsada Boutique',  '#f97316', '🛍️', 7);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (8,  'Jassem',           '#14b8a6', '👤', 8);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (9,  'Majed',            '#a855f7', '👤', 9);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (10, 'Maryam',           '#f43f5e', '👤', 10);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (11, 'Villa',            '#0ea5e9', '🏠', 11);
INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order) VALUES (12, 'Staff / Visas',    '#64748b', '📋', 12);

-- Properties
INSERT OR IGNORE INTO properties (id, name, type) VALUES (1,  'Villa 1 — Boss',       'villa');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (2,  'Villa 2 — Majids',     'villa');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (3,  'Office 601',            'office');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (4,  'Saeed Plaza',           'building');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (5,  'Maryam Plaza',          'building');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (6,  'Alsada 1',              'building');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (7,  'Alsada 8',              'building');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (8,  'Alsada 9',              'building');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (9,  'S101 — Ahmed Flat',    'other');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (10, 'Manama',                'building');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (11, 'Infusion Coffee House', 'shop');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (12, 'Gym',                   'shop');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (13, 'S-202 — Shaika Flat',  'other');
INSERT OR IGNORE INTO properties (id, name, type) VALUES (14, 'Boss Villa',            'villa');

-- Bill templates: FEWA & Sewerage
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 1,  'FEWA',     '101220001036', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 1,  'Sewerage', '3464300000',   1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 2,  'FEWA',     '210000035284', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 2,  'Sewerage', NULL,           1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 3,  'FEWA',     '101150026407', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 3,  'Sewerage', '8964972375',   1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 4,  'FEWA',     '101150026408', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 4,  'Sewerage', NULL,           1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 5,  'FEWA',     '101150017780', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 5,  'Sewerage', NULL,           1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 6,  'FEWA',     '211000055434', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 6,  'Sewerage', '773046646',    1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 7,  'FEWA',     NULL,           1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 8,  'FEWA',     NULL,           1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 9,  'FEWA',     '101150026397', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 10, 'FEWA',     '220000207377', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 10, 'Sewerage', '8842599761',   1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 11, 'FEWA',     '221000729409', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 11, 'Sewerage', '211000277222', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 12, 'FEWA',     '210000036906', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (1, 12, 'Sewerage', '3292927071',   1);
-- Internet
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (2, 3, 'Internet', NULL, 1);
-- Mobile
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (3, NULL, 'Boss DU',       '917581331111', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (3, 3,    'Boss Office',   '971507466660', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (3, NULL, 'Mohamed DU',    '0551828577',   1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (3, NULL, 'Ahmed Etisalat','0563666361',   1);
-- Maintenance
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (4, 4,    'Building Maintenance', NULL, 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (4, 5,    'Building Maintenance', NULL, 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (4, NULL, 'Others Maintenance',   NULL, 1);
-- Charity
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (5, NULL, 'Jabal Sina Medicine', NULL, 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (5, NULL, 'Others Charity',      NULL, 1);
-- Alsada Boutique
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (7, 13,   'FEWA',     '101150026400', 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (7, 13,   'Sewerage', NULL,           1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (7, NULL,  'Others',   NULL,          1);
-- Car
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (6, NULL, 'Car Insurance', NULL, 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (6, NULL, 'Gas/Petrol',    NULL, 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (6, NULL, 'Salik',         NULL, 1);
-- Staff
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (12, NULL, 'MSA Logistics — Tickets/Visas', NULL, 1);
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (12, 3,    'Office 601 Staff',              NULL, 1);
-- Villa
INSERT OR IGNORE INTO bills (category_id, property_id, particulars, account_no, due_day) VALUES (11, 14, 'Boss Villa', NULL, 1);
