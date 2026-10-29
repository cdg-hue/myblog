ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 100;
ALTER TABLE categories ADD COLUMN show_in_nav INTEGER NOT NULL DEFAULT 0 CHECK(show_in_nav IN (0, 1));

CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  name_en TEXT,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  UNIQUE(category_id, name),
  UNIQUE(category_id, slug)
);
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(post_id, tag_id)
);
CREATE INDEX idx_post_tags_tag ON post_tags(tag_id, post_id);

-- The legacy JSON field remains compatible with Obsidian and existing APIs.
-- Derive managed tag identities and associations inside the same transaction.
CREATE TRIGGER posts_tags_ai AFTER INSERT ON posts BEGIN
  INSERT OR IGNORE INTO tags (category_id, name, slug)
    SELECT c.id, trim(j.value), 'tag-' || lower(hex(randomblob(6)))
    FROM categories c, json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) j
    WHERE c.name = new.category AND j.type = 'text' AND trim(j.value) != '';
  INSERT OR IGNORE INTO post_tags (post_id, tag_id)
    SELECT new.id, t.id FROM tags t JOIN categories c ON c.id = t.category_id
    JOIN json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) j ON t.name = trim(j.value)
    WHERE c.name = new.category AND j.type = 'text';
END;
CREATE TRIGGER posts_tags_au AFTER UPDATE OF category, tags ON posts BEGIN
  DELETE FROM post_tags WHERE post_id = new.id;
  INSERT OR IGNORE INTO tags (category_id, name, slug)
    SELECT c.id, trim(j.value), 'tag-' || lower(hex(randomblob(6)))
    FROM categories c, json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) j
    WHERE c.name = new.category AND j.type = 'text' AND trim(j.value) != '';
  INSERT OR IGNORE INTO post_tags (post_id, tag_id)
    SELECT new.id, t.id FROM tags t JOIN categories c ON c.id = t.category_id
    JOIN json_each(CASE WHEN json_valid(new.tags) THEN new.tags ELSE '[]' END) j ON t.name = trim(j.value)
    WHERE c.name = new.category AND j.type = 'text';
END;
CREATE TRIGGER posts_tags_ad AFTER DELETE ON posts BEGIN
  DELETE FROM post_tags WHERE post_id = old.id;
END;

INSERT OR IGNORE INTO categories (name, slug, name_en, sort_order, show_in_nav) VALUES
  ('软件测评', 'software-reviews', 'Reviews', 10, 1),
  ('网站出海', 'global-sites', 'Global Sites', 20, 1),
  ('出海基建', 'global-setup', 'Global Setup', 30, 1);
UPDATE categories SET sort_order = 10, show_in_nav = 1 WHERE name = '软件测评';
UPDATE categories SET sort_order = 20, show_in_nav = 1 WHERE name = '网站出海';
UPDATE categories SET sort_order = 30, show_in_nav = 1 WHERE name = '出海基建';
WITH seed(category, name, name_en, slug, position) AS (VALUES
  ('software-reviews', 'AI 工具', 'AI Tools', 'ai-tools', 10),
  ('software-reviews', '效率工具', 'Productivity', 'productivity', 20),
  ('software-reviews', '开发工具', 'Developer Tools', 'developer-tools', 30),
  ('software-reviews', '浏览器插件', 'Browser Extensions', 'browser-extensions', 40),
  ('global-sites', '需求调研', 'Research', 'research', 10),
  ('global-sites', '建站部署', 'Development & Hosting', 'deployment', 20),
  ('global-sites', 'SEO', 'SEO', 'seo', 30),
  ('global-sites', '流量增长', 'Traffic Growth', 'traffic', 40),
  ('global-sites', '网站变现', 'Monetization', 'monetization', 50),
  ('global-setup', '手机卡', 'SIM Cards', 'sim-cards', 10),
  ('global-setup', '银行卡', 'Bank Cards', 'bank-cards', 20),
  ('global-setup', '收款支付', 'Payments', 'payments', 30),
  ('global-setup', '账号安全', 'Account Security', 'account-security', 40)
)
INSERT OR IGNORE INTO tags (category_id, name, name_en, slug, sort_order)
SELECT c.id, seed.name, seed.name_en, seed.slug, seed.position FROM seed JOIN categories c ON c.slug = seed.category;

INSERT OR IGNORE INTO categories (name, slug)
SELECT DISTINCT category, 'legacy-' || lower(hex(randomblob(6))) FROM posts
WHERE category IS NOT NULL AND trim(category) != '';
INSERT OR IGNORE INTO tags (category_id, name, slug)
SELECT c.id, trim(j.value), 'tag-' || lower(hex(randomblob(6)))
FROM posts p JOIN categories c ON c.name = p.category,
json_each(CASE WHEN json_valid(p.tags) THEN p.tags ELSE '[]' END) j
WHERE j.type = 'text' AND trim(j.value) != '';
INSERT OR IGNORE INTO post_tags (post_id, tag_id)
SELECT p.id, t.id FROM posts p JOIN categories c ON c.name = p.category
JOIN tags t ON t.category_id = c.id
JOIN json_each(CASE WHEN json_valid(p.tags) THEN p.tags ELSE '[]' END) j ON t.name = trim(j.value)
WHERE j.type = 'text';
