-- Migration 0056: PIN-based login + seed org chart employees
-- Adds pin column to users table and creates all org chart employees

-- Add pin column (4-digit PIN for quick login)
ALTER TABLE users ADD COLUMN pin TEXT DEFAULT NULL;

-- Add department column for org chart grouping
ALTER TABLE users ADD COLUMN department TEXT DEFAULT NULL;

-- Add job_title column 
ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT NULL;

-- ============================================================
-- Update existing users with org chart info & default PINs
-- PINs are SHA-256 hashed just like passwords
-- Default PINs: last 4 digits of a sequence (will be changed by users)
-- ============================================================

-- Vieri Bracco (id=12) — Owner/CEO
UPDATE users SET department = 'management', job_title = 'Owner / CEO', pin = '1212', active = 1 WHERE id = 12;

-- Carmine Garrett (id=10) — General Manager (reactivate)
UPDATE users SET department = 'management', job_title = 'General Manager', pin = '1010', active = 1 WHERE id = 10;

-- Laura Camargo (id=1) — CFO
UPDATE users SET department = 'management', job_title = 'CFO', pin = '1001' WHERE id = 1;

-- Izzy / Isabella Lewissohn-Moo (id=2) — Office Staff
UPDATE users SET name = 'Isabella Lewissohn-Moo', department = 'office', job_title = 'Office Staff', pin = '1002' WHERE id = 2;

-- Taj / Demarko Blair (id=3) — Warehouse Manager
UPDATE users SET name = 'Demarko "Taj" Blair', department = 'warehouse', job_title = 'Warehouse Manager', pin = '1003' WHERE id = 3;

-- Elliot Campbell (id=7) — Driver
UPDATE users SET department = 'logistics', job_title = 'Driver', pin = '1007' WHERE id = 7;

-- Jermaine Henry (id=8) — Driver
UPDATE users SET department = 'logistics', job_title = 'Driver', pin = '1008' WHERE id = 8;

-- Merrill Harvey (id=9) — Marketing / Sales
UPDATE users SET department = 'office', job_title = 'Marketing / Sales Rep', pin = '1009' WHERE id = 9;

-- Desk (id=11) — Office dispatcher terminal
UPDATE users SET department = 'office', job_title = 'Front Desk', pin = '1011' WHERE id = 11;

-- Deactivated drivers (id=4,5,6) — update dept but keep inactive
UPDATE users SET department = 'logistics', job_title = 'Driver' WHERE id IN (4, 5, 6);

-- ============================================================
-- Insert NEW employees from org chart
-- ============================================================

-- Office Staff
INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('maria.colon@britishfeed.com', 'Maria Colon Nogales', 'dispatcher', NULL, 'nologin', 1, 'office', 'Office Staff', '2001');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('audrey@britishfeed.com', 'Audrey Melvin', 'dispatcher', NULL, 'nologin', 1, 'office', 'Office Staff', '2002');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('jackie@britishfeed.com', 'Jackie Carrasco', 'dispatcher', NULL, 'nologin', 1, 'office', 'Office Staff', '2003');

-- Warehouse Staff
INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('adelson@britishfeed.com', 'Adelson Sintou', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Warehouse Staff', '3001');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('jorge@britishfeed.com', 'Jorge Benito', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Warehouse Staff', '3002');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('kenley@britishfeed.com', 'Kenley Damus', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Warehouse Staff', '3003');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('francisco@britishfeed.com', 'Francisco Atonal', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Warehouse Staff', '3004');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('joseph.cioffi@britishfeed.com', 'Joseph Cioffi', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Warehouse Staff', '3005');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('michael.brewer@britishfeed.com', 'Michael Brewer', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Warehouse Staff', '3006');

-- Drivers
INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('collin@britishfeed.com', 'Collin Forbes', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver', '4001');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('joey@britishfeed.com', 'Joey Enriquez', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver', '4002');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('bryan@britishfeed.com', 'Bryan James', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver', '4003');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('donald@britishfeed.com', 'Donald Joseph', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver', '4004');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('jacobi@britishfeed.com', 'Jacobi Williams', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver', '4005');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('efraim@britishfeed.com', 'Efraim Alvarado', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver', '4006');

-- Driver Assistants (new role: driver_assistant)
INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('ander@britishfeed.com', 'Ander Gonzales', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver Assistant', '5001');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('louidieu@britishfeed.com', 'Louidieu Charles', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver Assistant', '5002');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('pierre@britishfeed.com', 'Pierre Lafumee', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver Assistant', '5003');

INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('larry@britishfeed.com', 'Larry Brown', 'driver', NULL, 'nologin', 1, 'logistics', 'Driver Assistant', '5004');

-- Special roles
INSERT OR IGNORE INTO users (email, name, role, phone, password_hash, active, department, job_title, pin)
VALUES ('anthony@britishfeed.com', 'Anthony Tippins', 'warehouse', NULL, 'nologin', 1, 'warehouse', 'Red Mills / Grain Inventory Ordering', '6001');
