# Column Navigation and Scoped Tags

The public columns are 软件测评 (Reviews), 网站出海 (Global Sites), and 出海基建 (Global Setup).
Keep the fixed editorial theme; expose columns directly in desktop/mobile navigation and make search larger and labeled.

## Data Contract

- Reuse categories, adding navigation visibility and ordering; preserve existing articles and column URLs.
- Tags have stable IDs and slugs and belong to one category ID; identical labels in different columns are independent.
- Preserve posts.category and posts.tags JSON for existing clients and Obsidian. SQL triggers maintain normalized post_tags associations atomically for all writers, including translation drafts.
- Explicitly entered article tags may create managed tags; background AI cannot assign a column or publish new tags. AI suggestions require a click to apply.
- Moving an article with tags requires an explicit decision about tags. Column/tag renames update legacy fields atomically without changing stable IDs.
- Public counts and filters only use published, non-hidden, unprotected, non-deleted posts in the current language.
- Navigation-visible empty columns remain accessible. Empty tags are hidden from public filters, not from the editor.

## Delivery

1. Add schema, migration and tests for ownership, filtering, translation and legacy compatibility.
2. Add shared column navigation and tag filters with stable query URLs, localized labels and preserved pagination.
3. Add column ordering/visibility, tag management, editor suggestions and safe column changes.
4. Verify tests, lint, build and browser behavior across desktop/mobile and both languages.
5. Record a D1 Time Travel restore point, apply only migration 007, deploy and verify without altering existing article content.

Future content and taxonomy changes are database operations and do not require redeployment.
