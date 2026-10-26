-- One-time data backfill, not a schema migration.
-- IDs inspected in production on 2026-10-13; UI never classifies by product name.
-- Existing five Signature products already use COOKIE with the correct is_special.
UPDATE products
SET category='CHUNKY', updated_at=MAX(updated_at+1, CAST(strftime('%s','now') AS INTEGER)*1000)
WHERE category='COOKIE' AND is_special=0 AND id IN (
  'c5f326a7-1a34-4efa-8618-233d4d195a80', -- Classic cookie
  '6504c015-366b-44c5-965b-929c1bacac32', -- Matcha Oreo
  '9abd88ee-6cb7-465a-b90b-af9f3eb359f5'  -- Cheesy Red Velvet
);
