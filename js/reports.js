(function (global) {
  'use strict';
  function text(value) { return value === null || value === undefined ? 'NULL' : String(value); }
  function sourceTables(ast) {
    if (!ast) { return []; }
    const names = [];
    if (ast.from && ast.from.table) { names.push(ast.from.table.name); }
    (ast.joins || []).forEach(function (join) { names.push(join.table.table.name); });
    if (ast.table) { names.push(ast.table.name); }
    return names;
  }
  function treeSummary(plan) {
    if (!plan || !global.SqlFlow.queryplan) { return []; }
    return global.SqlFlow.queryplan.flattenTree(plan.root).map(function (node) {
      return { operation: node.type, text: node.text, stats: node.stats || null };
    });
  }
  function planStats(stats) {
    if (!stats) { return ''; }
    const parts = [];
    if (stats.inputRows !== undefined) { parts.push('input rows: ' + stats.inputRows); }
    if (stats.outputRows !== undefined) { parts.push('output rows: ' + stats.outputRows); }
    if (stats.comparisons !== undefined) { parts.push('comparisons: ' + stats.comparisons); }
    if (stats.matches !== undefined) { parts.push('matches: ' + stats.matches); }
    if (stats.groups !== undefined) { parts.push('groups: ' + stats.groups); }
    return parts.join(', ');
  }
  function build(result, options) {
    if (!result) { throw new Error('Run a query before generating a report.'); }
    const settings = options || {};
    const explanations = result.explanation || global.SqlFlow.explanations.build(result);
    return {
      title: 'SQLFLOW EXECUTION REPORT', project: 'SQLFlow', version: global.SqlFlow.config.version, generatedAt: settings.generatedAt || new Date().toLocaleString(),
      queryType: result.statementType || (result.ast && result.ast.type === 'SelectQuery' ? 'SELECT' : 'STATEMENT'), stageCount: result.stages.length,
      input: { sql: settings.sql !== undefined ? String(settings.sql) : result.inputSql || '', selectedExample: settings.selectedExample || result.selectedExample || 'Custom / modified query', sourceTables: sourceTables(result.ast) },
      steps: result.stages.map(function (stage, index) {
        const explanation = explanations.steps.find(function (step) { return step.stageIndex === index; });
        const previous = index ? result.stages[index - 1] : null;
        const inputRows = previous ? previous.rows.length : stage.rows.length;
        return { number: index + 1, operation: stage.label, clause: explanation ? explanation.clause : '', explanation: explanation ? explanation.whatHappened : stage.description, inputRows: inputRows, outputRows: stage.rows.length, join: stage.joinDetails || null, groups: stage.label === 'GROUP BY' ? stage.rows.length : null, filteredRows: ['WHERE', 'HAVING'].includes(stage.label) ? inputRows - stage.rows.length : null };
      }),
      output: { columns: result.resultColumns.slice(), rows: result.result.map(function (row) { return Object.assign({}, row); }), rowCount: result.result.length },
      algebra: result.queryPlan ? result.queryPlan.algebra : null, plan: treeSummary(result.queryPlan), explanation: explanations,
      limitation: 'SQLFlow is an educational logical simulator, not a physical DBMS query optimizer.'
    };
  }
  function toText(report) {
    const lines = [report.title, 'Project: ' + report.project + ' Version ' + report.version, 'Generated: ' + report.generatedAt, 'Query type: ' + report.queryType, 'Execution stages: ' + report.stageCount, '', 'A. USER INPUT', report.input.sql, 'Selected example: ' + report.input.selectedExample, 'Source table(s): ' + (report.input.sourceTables.join(', ') || 'None'), '', 'B. PROCESSING STEPS'];
    report.steps.forEach(function (step) {
      lines.push('', 'Stage ' + step.number + ' — ' + step.operation, step.clause ? 'Clause: ' + step.clause : '', step.explanation, 'Input rows: ' + step.inputRows, 'Output rows: ' + step.outputRows);
      if (step.join) { lines.push('JOIN comparisons: ' + step.join.comparisons, 'JOIN matches: ' + step.join.matchedRows, 'Unmatched left rows: ' + step.join.unmatchedRows); }
      if (step.groups !== null) { lines.push('Groups: ' + step.groups); }
      if (step.filteredRows !== null) { lines.push('Filtered out: ' + step.filteredRows); }
    });
    lines.push('', 'C. OUTPUT', 'Columns: ' + report.output.columns.join(', '), 'Row count: ' + report.output.rowCount);
    report.output.rows.forEach(function (row, index) { lines.push((index + 1) + '. ' + report.output.columns.map(function (column) { return column + '=' + text(row[column]); }).join(' | ')); });
    lines.push('', 'D. RELATIONAL ALGEBRA', report.algebra || 'Not available for this statement.', '', 'E. LOGICAL QUERY PLAN / TREE SUMMARY');
    if (report.plan.length) { report.plan.forEach(function (node) { lines.push(node.operation + ': ' + node.text + (planStats(node.stats) ? ' (' + planStats(node.stats) + ')' : '')); }); } else { lines.push('Not available for this statement.'); }
    lines.push('', 'F. EXPLANATION');
    report.explanation.steps.forEach(function (step) { lines.push(step.title, step.whatHappened, step.whyItMatters); });
    lines.push('Final Summary: ' + report.explanation.summary, '', 'G. LIMITATION', report.limitation);
    return lines.filter(function (line) { return line !== ''; }).join('\n');
  }
  function append(parent, tag, value, className) { const node = parent.ownerDocument.createElement(tag); if (className) { node.className = className; } node.textContent = value; parent.appendChild(node); return node; }
  function render(report, container) {
    container.replaceChildren(); append(container, 'h1', report.title); append(container, 'p', report.project + ' · Version ' + report.version); append(container, 'p', 'Generated: ' + report.generatedAt + ' · ' + report.queryType + ' · ' + report.stageCount + ' stages');
    append(container, 'h2', 'A. User Input'); append(container, 'pre', report.input.sql, 'report-sql'); append(container, 'p', 'Selected example: ' + report.input.selectedExample); append(container, 'p', 'Source table(s): ' + (report.input.sourceTables.join(', ') || 'None'));
    append(container, 'h2', 'B. Processing Steps'); report.steps.forEach(function (step) { const section = append(container, 'section', '', 'report-section'); append(section, 'h3', 'Stage ' + step.number + ' — ' + step.operation); if (step.clause) { append(section, 'code', step.clause); } append(section, 'p', step.explanation); append(section, 'p', 'Input rows: ' + step.inputRows + ' · Output rows: ' + step.outputRows); if (step.join) { append(section, 'p', 'JOIN comparisons: ' + step.join.comparisons + ' · Matches: ' + step.join.matchedRows + ' · Unmatched left: ' + step.join.unmatchedRows); } if (step.groups !== null) { append(section, 'p', 'Groups: ' + step.groups); } if (step.filteredRows !== null) { append(section, 'p', 'Filtered out: ' + step.filteredRows); } });
    append(container, 'h2', 'C. Output'); append(container, 'p', report.output.rowCount + ' row(s) · Columns: ' + report.output.columns.join(', ')); const wrap = append(container, 'div', '', 'report-table-wrap'); const table = append(wrap, 'table', '', 'report-table'); const head = append(table, 'thead', ''); const header = append(head, 'tr', ''); report.output.columns.forEach(function (column) { append(header, 'th', column); }); const body = append(table, 'tbody', ''); report.output.rows.forEach(function (row) { const tr = append(body, 'tr', ''); report.output.columns.forEach(function (column) { append(tr, 'td', text(row[column])); }); }); if (!report.output.rows.length) { const tr = append(body, 'tr', ''); const td = append(tr, 'td', 'No rows returned.'); td.colSpan = Math.max(1, report.output.columns.length); }
    append(container, 'h2', 'D. Relational Algebra'); append(container, 'pre', report.algebra || 'Not available for this statement.'); append(container, 'h2', 'E. Logical Query Plan / Tree Summary'); if (report.plan.length) { const ul = append(container, 'ul', ''); report.plan.forEach(function (node) { append(ul, 'li', node.operation + ' — ' + node.text + (planStats(node.stats) ? ' (' + planStats(node.stats) + ')' : '')); }); } else { append(container, 'p', 'Not available for this statement.'); }
    append(container, 'h2', 'F. Explanation'); report.explanation.steps.forEach(function (step) { const section = append(container, 'section', '', 'report-section'); append(section, 'h3', step.title); append(section, 'p', step.whatHappened); append(section, 'p', step.whyItMatters); }); append(container, 'h3', 'Final Summary'); append(container, 'p', report.explanation.summary); append(container, 'h2', 'G. Limitation'); append(container, 'p', report.limitation); return container;
  }
  function downloadText(report, documentObject, urlApi) {
    const doc = documentObject || global.document; const api = urlApi || global.URL; const blob = new Blob([toText(report)], { type: 'text/plain;charset=utf-8' }); const url = api.createObjectURL(blob); const link = doc.createElement('a'); link.href = url; link.download = 'sqlflow-execution-report.txt'; doc.body.appendChild(link); link.click(); link.remove(); api.revokeObjectURL(url); return true;
  }
  global.SqlFlow = global.SqlFlow || {}; global.SqlFlow.reports = { build: build, toText: toText, render: render, downloadText: downloadText };
})(typeof window !== 'undefined' ? window : globalThis);
