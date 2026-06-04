-- Custom SQL migration file, put your code below! --
-- Полнотекстовый поиск по задачам (замена SQLite FTS5).
-- Генерируемая tsvector-колонка из title+description + GIN-индекс.
-- Словарь 'simple' выбран намеренно: без стемминга, корректно работает и для
-- русского, и для английского, и поддерживает префиксный поиск (token:*).
ALTER TABLE "tasks" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("description", ''))
  ) STORED;
--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin ("search_vector");
