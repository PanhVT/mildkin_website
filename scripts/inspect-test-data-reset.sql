-- Read-only preflight. Review ALL deployed tables, triggers and foreign keys
-- against the repository before approving the separate cleanup script.
SELECT name, type, sql FROM sqlite_master
WHERE type IN ('table', 'trigger', 'view') ORDER BY type, name;
PRAGMA foreign_key_list(order_items);
PRAGMA foreign_key_list(payments);
PRAGMA foreign_key_list(orders);
PRAGMA foreign_key_list(sessions);
PRAGMA foreign_key_check;
SELECT * FROM d1_migrations ORDER BY id;
