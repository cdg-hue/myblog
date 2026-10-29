-- Recreate only the derived index; article content remains in posts.
DROP TRIGGER IF EXISTS posts_ai;
DROP TRIGGER IF EXISTS posts_au;
DROP TRIGGER IF EXISTS posts_ad;
DROP TABLE IF EXISTS posts_fts;

CREATE VIRTUAL TABLE posts_fts USING fts5(
  title, content, content=posts, content_rowid=id, tokenize='unicode61'
);

CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER posts_au AFTER UPDATE OF title, content ON posts
WHEN old.title IS NOT new.title OR old.content IS NOT new.content BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
END;

INSERT INTO posts_fts(posts_fts) VALUES ('rebuild');
