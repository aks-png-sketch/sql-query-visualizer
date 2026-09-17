# SQLFlow Version 1.2

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
- Dedicated Learn, Help, Project, and Developed By academic sections
- Persistent day/night themes and structured TXT/printable execution reports

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
js/config.js        Central project, version, student, and guide metadata
js/reports.js       Structured TXT and printable execution reports
js/academic.js      Learn, Help, Project, and Developed By workflows
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

## Academic project statement

Problem: traditional SQL tools usually show only a final result or error, leaving students unable to observe how logical operations transform rows.

Objective: provide an interactive browser-based system that connects SQL syntax to FROM, JOIN, filtering, grouping, projection, sorting, limits, data modification, and transactions through measured intermediate stages.

SQLFlow is a working educational prototype in Core Database Systems / Database Management Systems. It is not presented as a production DBMS.

## Execution reports

After a successful statement, **Open Execution Report** shows a structured report built directly from the parsed statement, execution stages, query plan, and deterministic explanation metadata. **Download TXT Report (.txt)** saves it as text; **Print / Save as PDF** opens browser printing. The report includes User Input, Processing Steps, Output, Relational Algebra when available, logical-plan summary, Explanation, and the educational-simulator limitation.

Supported formats:

- Text (`.txt`)
- Print-friendly HTML through the browser, including Save as PDF

## References

- Abraham Silberschatz, Henry F. Korth, and S. Sudarshan, *Database System Concepts*.
- Ramez Elmasri and Shamkant B. Navathe, *Fundamentals of Database Systems*.
- [PostgreSQL SQL Tutorial](https://www.postgresql.org/docs/current/tutorial-sql.html).
- [MDN Web Docs: Window.localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

## Professor-compliance checklist

| Requirement | Status | Implementation |
| --- | --- | --- |
| Project title | IMPLEMENTED | Header, Project view, reports, and configuration |
| Student name, register number, course, and photograph | IMPLEMENTED | Centralized in `js/config.js`; local photograph at `assets/student-photo.jpeg` |
| Problem statement / objective | IMPLEMENTED | Project view and README |
| System architecture | IMPLEMENTED | Actual pipeline and module-responsibility views |
| Mandatory website sections | IMPLEMENTED | SQL Lab, Learn, Help, Project, Developed By |
| Learn concepts | IMPLEMENTED | Fourteen supported-topic cards with runnable examples |
| Video placeholder | IMPLEMENTED | Project Demo Video placeholder in Learn |
| Recorded demonstration video | NEEDS MANUAL CONTENT | Add or link the actual recording when available |
| References | IMPLEMENTED | Learn and README references |
| Developed By | IMPLEMENTED | Configurable student card and supplied guide details |
| Help | IMPLEMENTED | Six-step workflow and complete usage guidance |
| Download report | IMPLEMENTED | Open Execution Report, Download TXT Report, and Print / Save as PDF controls |
| User Input | IMPLEMENTED | Exact SQL, selected example, and source tables in report |
| Processing Steps | IMPLEMENTED | Every measured execution stage in report |
| Output | IMPLEMENTED | Columns, rows, and row count in report |
| Day/Night Mode | IMPLEMENTED | Accessible, persisted theme with system fallback |
| Core functionality | IMPLEMENTED | Existing SQL Lab and visualizations preserved |
| Testing | IMPLEMENTED | Browser regression and academic compliance suites |
| Creative features | IMPLEMENTED | Explanation, algebra, trees, JOIN visualization, Presentation Mode, transactions |
| Challenges / solutions | IMPLEMENTED | Project view |
| Future enhancements | IMPLEMENTED | Project view and Known Limitations |
| Conclusion | IMPLEMENTED | Project view |

Before final submission, add or link the recorded demonstration video if required by the professor.

Pre-deployment verification: 726/726 browser tests passed after the Version 1.2 rubric fixes, including visible report-control clicks and a check for uncaught browser errors and unhandled rejections. A real Chrome click downloaded a non-empty TXT file with User Input, Processing Steps, and Output; the print control invoked browser printing, and Chrome generated a valid non-empty PDF from the open report. Temporary outputs stayed outside the repository. A human review of actual PDF pagination remains advisable. Layout and theme checks covered 390px, 768px, and 1366px, with the mobile navigation overflow corrected. No demo video has been supplied yet.
