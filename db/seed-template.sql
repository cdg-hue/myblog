INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('default_theme', 'editorial'),
  ('body_font', 'serif'),
  ('nav_links', '[{"label":"GitHub","url":"https://github.com/cdg-hue/myblog","openInNewTab":true},{"label":"RSS","url":"/feed.xml","openInNewTab":false}]');

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
