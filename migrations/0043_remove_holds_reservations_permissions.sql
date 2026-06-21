-- Remove holds and reservations permissions from role_permissions
-- These tabs have been removed from the inventory module since
-- hold/reservation data is managed through the POS system.
DELETE FROM role_permissions WHERE module = 'inventory' AND feature = 'holds';
DELETE FROM role_permissions WHERE module = 'inventory' AND feature = 'reservations';
