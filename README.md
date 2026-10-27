# SQLFlow Version 1.5

The public frontend runs entirely on GitHub Pages: SQL execution, animations, Quiz, Competitive Exam and References require no backend. Quiz and exam history on the public site is stored in the current browser, not PostgreSQL. The optional localhost PostgreSQL/FastAPI integration remains available for local demonstration; see [backend/README.md](backend/README.md). No database credentials or data files belong in the public repository.

The Competitive Exam section contains 75 original, solved practice questions across ten DBMS topics. Its GATE-style and PSU-style tags describe practice format; none claim to be a historical exam question. A separate References panel links verified textbooks, research and official documentation. AI Tutor is disabled on the public site; the optional local version requires explicit server-side provider configuration. Verified deterministic answers remain available without AI.

Reference examples: [Database System Concepts, 7th ed.](https://www.yale.db-book.com/) for relational theory; [Selinger et al. (1979)](https://doi.org/10.1145/582095.582099) for historical optimizer research; [PostgreSQL 18 documentation](https://www.postgresql.org/docs/18/tutorial-select.html) for SQL behavior; and the [official GATE 2025 papers and keys](https://gate2025.iitr.ac.in/question-papers.html) for exam format. Research on physical optimizers is background reading, not a claim that SQLFlow implements those algorithms.

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
- Recorded row-action replay for SELECT stages, with Play/Pause, action navigation, restart, final reveal, and four speeds
- Searchable Help manual with 23 topics and six guided tutorials using real UI controls
- A top-level Quiz module with 302 authored questions across 20 topics, practice/test modes, review, retry, and local resume
- The user-selected JOIN video, “Joins in SQL” by Neso Academy, with YouTube embed and exact-link fallback

## Supported SQL

SQLFlow supports one statement at a time:

- `SELECT`, `DISTINCT`, `FROM`, `WHERE`, `AND`, `OR`, `NOT`, and parentheses
- `AS` output aliases, including aggregate aliases; unambiguous aliases work in `ORDER BY`
- `IS NULL`, `IS NOT NULL`, `[NOT] IN (literal, ...)`, `[NOT] BETWEEN literal AND literal`, and `[NOT] LIKE 'pattern' [ESCAPE 'x']`
- SQL three-valued predicate logic: comparisons with `NULL` are unknown; `WHERE` and `HAVING` retain only true rows
- `INNER JOIN` / `JOIN` and `LEFT JOIN` with equality-based `ON` conditions
- `GROUP BY`, `HAVING`, multi-key `ORDER BY`, and `LIMIT`
- `COUNT`, `COUNT(DISTINCT column)`, `SUM`, `AVG`, `MIN`, and `MAX`
- Table aliases and qualified column references
- `INSERT`, `UPDATE`, and `DELETE` on custom tables
- `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, and `ROLLBACK TO`

`LIKE` is case-sensitive; `%` matches zero or more characters and `_` matches one. An optional single-character `ESCAPE` quotes those wildcards. SQLFlow orders `NULL` last in ASC and first in DESC and retains input order when all keys tie. It does not support subqueries, implicit output aliases, RIGHT/FULL/CROSS JOIN, window functions, multi-column COUNT DISTINCT, or physical query-plan algorithms.

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
js/simulation.js    Recorded action playback and safe learning tables/code
js/help.js          Searchable manual, contextual errors, and guided tutorials
js/quiz-bank.js     Authored stable questions and isolated fixed fixtures
js/quiz-fixtures.js Additional isolated market, library, clinic, and workshop fixtures
js/quiz-expansion.js 200 authored questions and documented metadata corrections
js/quiz-audit.js    Browser-safe bank validation and SQL answer checks
js/quiz-engine.js   SELECT grading, scoring, shuffling, and persistence
js/quiz.js          Quiz home, interactive attempts, results, and reviews
tests.html/tests.js Dependency-free browser regression suite
learning-tests.js   Learning, fixture, grading, and replay regressions
refinement-tests.js Expanded bank, playback, Help, and persistence regressions
quiz-quality-audit.cjs Isolated engine and transaction accuracy audit
browser-learning-tests.cjs Real Chrome clicks and responsive checks without packages
```

## Testing

Open `tests.html` in a browser. The page runs the complete dependency-free regression suite and reports the pass total. It can also be loaded by a headless browser for automated verification.

Version 1.4 passed 1,497/1,497 browser regressions, 55/55 focused real-Chrome compatibility checks, and 412/412 complete real-Chrome interaction checks before release. The earlier Version 1.3 compatibility baseline passed 1,486/1,486 regressions and 25/25 focused Chrome checks. Run `node quiz-quality-audit.cjs` for the answer audit, `node browser-learning-tests.cjs --http --v14-smoke` for focused compatibility checks, or `node browser-learning-tests.cjs --http` for the complete interaction suite. The Chrome runner uses Node's built-in WebSocket/CDP support (tested with Node 24), an isolated temporary profile, a temporary local HTTP preview, and system-temp artifacts. Set `SQLFLOW_CHROME` if Chrome is installed elsewhere. No npm installation is needed.

## Learn → Visualize → Practice → Review

Learn cards link to topic practice. Help provides search, topic navigation, expandable SQL examples, contextual error suggestions, and guided SELECT, WHERE, JOIN, GROUP BY, animation, and report tutorials. Tutorial completion is stored only after the required actions are observed. Missing targets block progression and cancellation records no new completion.

The JOIN lesson embeds `h4EQBAzW3m4`; YouTube oEmbed verified the title “Joins in SQL”, creator “Neso Academy”, and an embed URL. Regional/browser restrictions can still affect playback. The fallback preserves the exact requested URL: https://youtu.be/h4EQBAzW3m4?si=1JtslSqT4QU3ZziA. This instructional video does not replace the pending student demo recording.

Quiz questions have stable IDs and Beginner/Intermediate/Advanced metadata. All 20 topics have at least five questions at every level: 100 Beginner, 102 Intermediate, and 100 Advanced (302 total). The original 102 IDs, stems, and answer keys remain; 55 difficulty labels and 102 hints were corrected with recorded rationales. Types include single/multiple choice, true/false, row-output prediction, fill-in, error identification, query choice, stage ordering, JOIN/filter/group predictions, row/pair/group decisions, SQL writing, and SQL repair. Predictions select candidate tuples with displayed columns, including an explicit empty-result choice; the SQL editor grades actual columns and duplicate-sensitive rows against authored fixture expectations.

SQL grading accepts SELECT only against fresh learner, market, library, clinic, and workshop fixtures, with at most three JOINs and 3,000 input characters. It compares actual output, resolved source column identities, and named ordering requirements rather than exact SQL text. Questions requiring order use ordered comparison; otherwise rows are compared as a duplicate-preserving bag. DML/transaction questions assess concepts without modifying user tables; the separate audit executes 30 cases against isolated transaction stores. Practice provides hints and checked feedback; Test withholds correctness and writing reference answers until submission. Each question earns one point or zero, with no partial credit. Skipped answers earn zero. Timed deadlines, scores, measured weak-topic recommendations, ten recent results, cumulative seen/mastered IDs, and unfinished attempts are stored locally when available. The save format retains active work within a 500,000-character budget by evicting older history first.

## Measured execution replay

The executor captures its actual predicate decisions, JOIN comparisons, group assignments, projection values, duplicate retention, ordering keys, and limits. Running aggregate states use the same aggregate helper as execution. The player consumes those records and reconstructs earlier prefixes when rewound; it does not run a second SQL engine. ORDER BY reveals measured result positions and keys without naming a physical sorting algorithm. LEFT JOIN preserves unmatched left rows with NULL right cells. NULL ordinary comparisons now fail filters, including inequality.

Output begins empty for traced stages. The current input, operation, actual predicate values, named decision, output contribution, and progress are displayed. Play shows a processing phase before committing each measured row action. Completed stage results remain available in a collapsed reference table. Action Play and whole-stage Auto Play stop each other. Query/tab/stage changes dispose prior playback. Theme/presentation changes preserve action state. Replay uses an honest full-result summary above 1,000 input rows, 2,000 actions, or 200 grouping/aggregate input rows; DML/transaction operations retain their existing measured summaries and timelines.

Remaining depth/verification work: output-prediction questions use candidate tuples instead of a free-form table editor; human YouTube playback, screen-reader review, and PDF pagination remain manual checks. Cross-browser testing beyond Chrome has not been performed.

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
