# SQLFlow

SQLFlow is an interactive SQL Query Execution Visualizer built as an educational Database Systems project. It lets learners write SQL, inspect intermediate datasets, compare relational algebra, explore a synchronized logical query tree, and observe data changes and transaction state—all in a static browser application.

## Features

- Stage-by-stage execution with Previous, Next, and Auto Play controls
- Safe, case-insensitive parsing and clear validation errors
- Relational algebra and interactive logical query trees
- A deterministic Explanation view that turns actual AST and execution metadata into plain-English teaching notes
- Built-in UniversityDB tables with searchable visual previews
- Inner and left joins with match statistics and join-key highlighting
- Custom table creation, editing, CSV import/export, and local persistence
- INSERT, UPDATE, DELETE, transactions, savepoints, rollback, and commit
- Presentation mode, quick-start examples, keyboard shortcuts, help tips, and status toasts
- Responsive layouts, visible keyboard focus, and reduced-motion support

## Supported SQL

SQLFlow supports one statement at a time:

- `SELECT`, `DISTINCT`, `FROM`, `WHERE`, `AND`, `OR`, and parentheses
- `INNER JOIN` / `JOIN` and `LEFT JOIN` with equality-based `ON` conditions
- `GROUP BY`, `HAVING`, `ORDER BY`, and `LIMIT`
- `COUNT`, `SUM`, `AVG`, `MIN`, and `MAX`
- Table aliases and qualified column references
- `INSERT`, `UPDATE`, and `DELETE` on custom tables
- `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, and `ROLLBACK TO`

## Run locally

No build step, package manager, framework, or server is required. Open `index.html` in a current browser. A small static HTTP server may also be used if preferred.

Keyboard shortcuts:

- Ctrl/Cmd + Enter: run the current statement
- Alt + Right: next execution stage
- Alt + Left: previous execution stage
- Escape: close an open panel or leave Presentation Mode

## Project structure

```text
index.html          Application markup
style.css           Responsive visual design and animations
script.js           Application wiring and UI workflows
js/database.js      UniversityDB registry and custom-table persistence
js/parser.js        Tokenizer and AST-like SQL parser
js/executor.js      Query and DML execution pipeline
js/transactions.js  Transaction working state and timeline
js/queryplan.js     Relational algebra and logical query plans
js/explanations.js  Deterministic stage explanations and final summaries
js/visualizer.js    Safe tables, stages, plans, joins, and transaction views
js/examples.js      Categorized example statements
js/ui.js            Presentation, toast, reset, and keyboard behavior
tests.html/tests.js Dependency-free browser regression suite
```

## Testing

Open `tests.html` in a browser. The page runs the complete dependency-free regression suite and reports the pass total. It can also be loaded by a headless browser for automated verification.

## Explanation view

The Explanation tab complements the intermediate Execution tables, Relational Algebra, and Query Tree. It creates one synchronized explanation card per measured execution stage, including actual row and column counts, filtering effects, grouping statistics, JOIN comparisons and matches, duplicate removal, limits, affected DML rows, and transaction state. It is entirely deterministic and client-side: it uses the parsed AST and execution results and never calls an AI model, API, or external service.

Explanation supports SELECT pipelines, projections, Boolean filtering, DISTINCT, sorting, limits, grouping, aggregate functions, HAVING, INNER/LEFT JOINs, DML statements, and transaction-control statements. Clicking a card opens its corresponding execution stage.

## Browser requirements

A current version of Chrome, Edge, Firefox, or Safari is recommended. The project uses modern JavaScript and DOM APIs, CSS Grid/Flexbox, and browser `localStorage` for custom-table persistence.

## Known limitations

SQLFlow is an educational logical simulator, not a full SQL database. It intentionally does not support RIGHT/FULL OUTER JOIN, subqueries, CTEs, window functions, triggers, stored procedures, concurrency/locking, physical indexes, query optimization, authentication, or a backend. JOIN conditions are equality-based, statements run one at a time, and custom data remains local to the current browser profile.

## Deployment

All assets use portable relative paths and the project has no runtime dependencies. The repository can be published directly as a static site on GitHub Pages or Netlify with the project root as the publish directory. No secrets, environment variables, redirects, or server functions are required.
