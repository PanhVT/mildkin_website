-- Add only a column: preserve inventory triggers, foreign keys and all rows.
ALTER TABLE products ADD COLUMN units_per_pack INTEGER NOT NULL DEFAULT 1
  CONSTRAINT units_per_pack_positive CHECK (units_per_pack >= 1);
--> statement-breakpoint
-- Explicit seed configuration, not parsing display labels. Leave customized
-- packaging and non-seed products at default 1 for seller review.
UPDATE products SET units_per_pack=3
WHERE id IN ('original','chocolate','matcha','mixed','mixed-mystery-face')
  AND slug=id AND (pack_label='3 cookies / pack' OR pack_label IS NULL);
