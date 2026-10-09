# SQLFlow v1.3 — expansion, playback and student-journey audit

Audit date: 2026-10-09. Canonical workspace: `C:\Users\aksha\Projects\sql-query-visualizer`.

Starting state: pending v1.3 on main, release HEAD `df98e40adf04e97764c48648769e714b014b1abf`, 102 questions, 1010/1010 regressions and 159/159 Chrome checks. Existing uncommitted work was retained. The user later authorized the v1.3 release after a short final check.

## Bank accuracy and changes

302 questions: 200 additions; all original 102 IDs, stems, and answer keys remain. 55 original difficulty labels were corrected by cognitive demand and 102 generic hints were replaced. The machine-readable correction ledger is `SqlFlow.quizBank.revisions` in `js/quiz-expansion.js`.

Every topic has five Beginner and five Advanced questions. INNER JOIN and HAVING have six Intermediate questions; the other 18 topics have five. Total distribution is 100 Beginner / 102 Intermediate / 100 Advanced.

The audit checks duplicate IDs, exact and number-normalized stems, required fields, topic/difficulty quotas, actual grading, and every answer subset for choices/predictions. Current evidence: 79 SQL/error/trace oracles, 4306 answer checks, and 30 DML/transaction cases run against the actual engine in fresh VM realms with private memory storage. Run `node quiz-quality-audit.cjs` to reproduce.

The token similarity detector flags original `inner-04` / `multiple-04` (Jaccard 0.714 at threshold 0.6). Reviewed disposition: distinct tasks, not a renamed duplicate. The first query fails ambiguous projection resolution; the second fails ON source-connectivity validation. Both actual errors are checked. A lexical similarity detector is not a proof of absence of all semantic overlap.

Conceptual answers were reviewed using the inspected parser/executor/transaction code, explicit arithmetic, and logical counterexamples. The SQL fixtures cover a shop, library (including an empty reservations table), clinic, workshop, and the retained learner dataset. Transaction examples are checked separately and never operate on user tables during quiz grading.

## Student journey — accepted screenshot evidence

This report follows the Product Design audit workflow: current-run screenshots, actual mouse/key interaction, DOM checks, screenshot inspection, and limits stated separately. The Chrome runner writes captures and its complete `checks.json` outside the repository. This run's capture directory is `C:\Users\aksha\AppData\Local\Temp\sqlflow-learning-artifacts-Sm81Ie`.

1. Open SQLFlow — healthy. Accepted `01-open-sqlflow.png`: v1.3, six navigation controls, editor, registry and real flow buttons load in the existing visual identity. The default query has executed; its row-action replay is initially paused. Screenshot evidence alone cannot prove parser correctness; the regression suite supplies that evidence.

2. Understand the learning path — healthy. Accepted `02-understand-the-path.png`: the concise intro explicitly connects Learn, visualization, quiz practice and mistake review; the stable view is unobscured after the transient startup notification ends. Existing quick examples and a guided-tour entry remain visible.

3. Study WHERE in Learn — healthy. Accepted `03-study-where.png`: a concise definition, supported example, practice link and real Lab action are visible. The logical-order distinction is explicit. Code is compact; human zoom/screen-reader checks remain advisable rather than claiming full accessibility compliance.

4. Load the WHERE example — functional, label correction identified. Accepted `04-load-where-example.png` proves the lesson loads and executes supported SQL and rebuilds its flow. It also exposes a real UX issue: the dropdown still says Default Query. The planned correction is to synchronise the selector on external lesson loads and editor changes; final evidence must verify the corrected state.

5. Run the query — healthy execution; same selector issue pending. Accepted `05-run-where-query.png`: Run Query executes and rebuilds FROM → WHERE → SELECT → RESULT. DOM checks confirm a successful report state; the transient notification supplies measured row/stage counts. Numeric correctness is checked against the real executor rather than inferred from a screenshot.

6. Play and pause WHERE — healthy. Accepted `06-play-and-inspect-where.png`: the actual predicate, value 9.4, threshold 8, True result, Accepted decision, current occurrence and contributed tuple are explicit. Progress is one completed action and one output row. Wide relations scroll internally; controls remain separate from whole-stage navigation. Human screen-reader validation is still required.

7. Help manual — healthy. Accepted `07-interactive-help.png`: the searchable 23-topic sidebar, welcome explanation, expandable supported example, and lesson/quiz links are visible. The modal retains a fixed header and separate scrollable topic list. Mouse and keyboard checks confirm the navigation actions; a screen reader remains a separate human check.

8. Guided WHERE tutorial — healthy. Accepted `08-complete-guided-tutorial.png`: the tutorial required a real Run action and observed a WHERE replay action before marking completion. The screenshot shows `cgpa = 9.4`, `> 8`, `True`, `Accepted`, one contributed tuple and one completed action. The transient execution toast is visible in this capture but clears normally.

9. Finish a WHERE quiz — healthy. Accepted `09-topic-quiz-completed.png`: the deliberate wrong answer produces 80%, four correct, one incorrect, zero skipped, duration, a topic breakdown, and working review/retry/lesson/animation actions. Weak-topic practice is disabled because this topic scored above its threshold; that reflects the measured result.

10. Review the mistake — healthy. Accepted `10-review-mistake.png`: the student's OR choice and correct AND predicate remain distinguishable, with a concrete explanation and working lesson and animation links. Options and feedback are visible in one scrollable modal.

11. Return to Learn — healthy. Accepted `11-return-to-learn.png`: Review Lesson navigates back to the related WHERE card; the INNER JOIN card and video entry remain discoverable.

12. Study JOIN — healthy. Accepted `12-study-inner-join.png`: INNER and LEFT JOIN cards have distinct concise meanings and supported SQL examples, plus Lab, Quiz and video actions.

13. Open the selected JOIN video — partially verified. Accepted `13-selected-neso-video.png`: the actual embedded player loads the user-selected `h4EQBAzW3m4` thumbnail, “Joins in SQL” title and Neso Academy attribution over local HTTP. `13b-video-playback-attempt.png` records a play click, but no verified playback transition; the exact requested Watch on YouTube fallback is visible. Network and provider restrictions make human playback confirmation necessary. The thumbnail mentions RIGHT/FULL/NATURAL joins; SQLFlow's own supported-syntax section correctly limits the engine to INNER and LEFT JOIN.

14. Run JOIN simulation — healthy. Accepted `14-run-join-simulation.png`: actual `s.student_id = e.student_id` operands, values `1001 = 1001`, Match/Matched status, distinct left/right input rows, contributed joined tuple and measured `1 of 150 actions` are visible. The output relation builds from the executor trace. Wide joined tuples scroll inside their table.

15. Complete JOIN quiz — healthy. Accepted `15-complete-join-quiz.png`: five intermediate JOIN questions score 100%, with measured topic breakdown and the same review/lesson/animation actions; incorrect retry is accurately disabled when nothing was missed.

16. Open report — healthy. Accepted `16-open-execution-report.png`: Version 1.3, exact JOIN SQL, source tables, USER INPUT, PROCESSING STEPS, Download TXT and Print / Save as PDF are visible. The report correctly labels this externally loaded SQL as custom/modified.

17. Export report — healthy control access. Accepted `17-export-report.png`: the physical clicks reach both visible download and print controls. Separate Chrome checks inspect the real downloaded text sections and nonempty PDF bytes; a human should still review pagination and use the OS print dialog. No decorative generic Export button is present.

The original capture 04 exposed an inaccurate example selector. `script.js` now synchronizes it with every editor change, lesson load and query run. A final Chrome run asserts the visible “Custom / lesson query” label when the WHERE lesson loads.

Final local verification: 1,477/1,477 regressions and 412/412 full Chrome interactions passed before the guide photograph was added. After adding `assets/guide-photo.png`, a focused 9/9 Chrome smoke run verified both photographs load, SQL execution, animation, Quiz submission, Help, the JOIN video link, report opening, and no application console exceptions. Video playback itself, screen-reader use, and human PDF pagination remain manual checks.
