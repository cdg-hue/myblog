ALTER TABLE posts ADD COLUMN language TEXT NOT NULL DEFAULT 'zh-CN' CHECK (language IN ('zh-CN', 'en'));
ALTER TABLE posts ADD COLUMN translation_group_id TEXT;
ALTER TABLE categories ADD COLUMN name_en TEXT;

CREATE INDEX idx_posts_language_published ON posts(language, status, deleted_at, published_at DESC);
CREATE UNIQUE INDEX idx_posts_translation_language ON posts(translation_group_id, language)
  WHERE translation_group_id IS NOT NULL AND deleted_at IS NULL;
