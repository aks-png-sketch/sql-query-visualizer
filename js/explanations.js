(function (global) {
  'use strict';

  function plural(count, word) { return count + ' ' + word + (count === 1 ? '' : 's'); }
  function identifier(node) { return node ? (node.qualifier ? node.qualifier + '.' : '') + node.name : ''; }
  function value(node) { return node && node.valueType === 'string' ? "'" + node.value + "'" : String(node ? node.value : ''); }
  function expression(node) {
    if (!node) { return '';
    }
    if (node.type === 'ColumnReference') { return identifier(node); }
    if (node.type === 'AggregateExpression') { return node.functionName + '(' + (node.argument.type === 'Wildcard' ? '*' : identifier(node.argument)) + ')'; }
    if (node.type === 'ComparisonExpression') { return expression(node.left || node.operand) + ' ' + node.operator + ' ' + value(node.right || { value: node.value, valueType: typeof node.value === 'string' ? 'string' : 'number' }); }
    if (node.type === 'GroupedExpression') { return '(' + expression(node.expression) + ')'; }
    if (node.type === 'LogicalExpression') { return expression(node.left) + ' ' + node.operator + ' ' + expression(node.right); }
    return node.label || '';
  }
  function tableReference(reference) {
    const name = reference && reference.table ? reference.table.name : '';
    return { name: name, alias: reference && reference.alias ? reference.alias.name : null };
  }
  function aggregateText(aggregate, grouped) {
    const argument = aggregate.argument.type === 'Wildcard' ? '*' : identifier(aggregate.argument);
    const context = grouped ? ' within each group' : ' across the single implicit group formed by all rows';
    if (aggregate.functionName === 'COUNT') { return argument === '*' ? 'COUNT(*) counts every row' + context + '.' : 'COUNT(' + argument + ') counts non-NULL values' + context + '.'; }
    if (aggregate.functionName === 'AVG') { return 'AVG(' + argument + ') calculates the mean value' + context + '.'; }
    if (aggregate.functionName === 'SUM') { return 'SUM(' + argument + ') adds the numeric values' + context + '.'; }
    if (aggregate.functionName === 'MIN') { return 'MIN(' + argument + ') finds the smallest value' + context + '.'; }
    return 'MAX(' + argument + ') finds the largest value' + context + '.';
  }
  function reason(operation) {
    const reasons = {
      FROM: 'FROM identifies the table that provides the query\'s source rows.',
      WHERE: 'WHERE filters individual rows before projection, grouping, and aggregation.',
      SELECT: 'SELECT controls which columns or calculated values appear in the result.',
      'SELECT / AGGREGATE': 'SELECT produces the visible grouped values and calculates the requested aggregates.',
      DISTINCT: 'DISTINCT removes repeated combinations from the projected result.',
      'ORDER BY': 'ORDER BY controls the sequence in which result rows are displayed.',
      LIMIT: 'LIMIT restricts how many rows are returned after earlier operations finish.',
      'GROUP BY': 'GROUP BY partitions rows so aggregate functions can be calculated separately for each group.',
      HAVING: 'HAVING filters groups after aggregation, while WHERE filters source rows before grouping.',
      'INNER JOIN': 'INNER JOIN keeps only row combinations whose join keys match.',
      'LEFT JOIN': 'LEFT JOIN preserves every left row and fills missing right-side values with NULL.'
    };
    return reasons[operation] || 'This stage transforms the current data as required by the statement.';
  }
  function selectClause(ast) {
    if (ast.select.all) { return '*'; }
    return ast.select.expressions.map(expression).join(', ');
  }
  function stageCounts(stages, index) {
    const stage = stages[index];
    const previous = index ? stages[index - 1] : null;
    return { inputRows: previous ? previous.rows.length : stage.rows.length, outputRows: stage.rows.length, inputColumns: previous ? previous.columns.length : stage.columns.length, outputColumns: stage.columns.length };
  }
  function buildSelect(result) {
    const ast = result.ast;
    const steps = result.stages.map(function (stage, stageIndex) {
      const counts = stageCounts(result.stages, stageIndex);
      const baseOperation = stage.label.indexOf('INNER JOIN') === 0 ? 'INNER JOIN' : stage.label.indexOf('LEFT JOIN') === 0 ? 'LEFT JOIN' : stage.label;
      let clause = '';
      let happened = stage.description;
      const stats = { inputRows: counts.inputRows, outputRows: counts.outputRows, rowsRemoved: Math.max(0, counts.inputRows - counts.outputRows), inputColumns: counts.inputColumns, outputColumns: counts.outputColumns };
      if (baseOperation === 'FROM') {
        const source = tableReference(ast.from);
        clause = 'FROM ' + source.name + (source.alias ? ' AS ' + source.alias : '');
        happened = 'SQLFlow loads the ' + source.name + ' table' + (source.alias ? ' as ' + source.alias : '') + '. It contains ' + plural(stage.rows.length, 'row') + ' and ' + plural(stage.columns.length, 'column') + '.';
      } else if (baseOperation === 'WHERE') {
        clause = 'WHERE ' + expression(ast.where);
        happened = 'The condition ' + expression(ast.where) + ' is checked against each row. ' + counts.outputRows + ' of ' + counts.inputRows + ' rows satisfy it; ' + plural(counts.inputRows - counts.outputRows, 'row') + ' ' + (counts.inputRows - counts.outputRows === 1 ? 'is' : 'are') + ' filtered out.';
      } else if (baseOperation === 'SELECT' || baseOperation === 'SELECT / AGGREGATE') {
        clause = 'SELECT ' + (ast.distinct ? 'DISTINCT ' : '') + selectClause(ast);
        const aggregates = ast.select.expressions.filter(function (item) { return item.type === 'AggregateExpression'; });
        const projection = ast.select.all ? 'SELECT * keeps every available column.' : 'The query projects ' + selectClause(ast) + ', producing ' + plural(stage.columns.length, 'visible column') + '.';
        happened = projection + (aggregates.length ? ' ' + aggregates.map(function (item) { return aggregateText(item, Boolean(ast.groupBy)); }).join(' ') : '') + ' The visible shape changes from ' + counts.inputColumns + ' to ' + counts.outputColumns + ' columns.';
        stats.aggregates = aggregates.map(expression);
      } else if (baseOperation === 'DISTINCT') {
        clause = 'DISTINCT';
        happened = 'DISTINCT compares the projected rows and removes ' + plural(counts.inputRows - counts.outputRows, 'duplicate row') + ', leaving ' + plural(counts.outputRows, 'unique row') + '.';
      } else if (baseOperation === 'ORDER BY') {
        clause = 'ORDER BY ' + expression(ast.orderBy.expression) + ' ' + ast.orderBy.direction;
        happened = 'The ' + plural(counts.outputRows, 'row') + ' ' + (counts.outputRows === 1 ? 'is' : 'are') + ' sorted by ' + expression(ast.orderBy.expression) + ' in ' + ast.orderBy.direction + ' order, from ' + (ast.orderBy.direction === 'DESC' ? 'highest to lowest' : 'lowest to highest') + '.';
      } else if (baseOperation === 'LIMIT') {
        clause = 'LIMIT ' + ast.limit.count;
        happened = 'LIMIT ' + ast.limit.count + ' keeps the first ' + counts.outputRows + ' rows and excludes ' + Math.max(0, counts.inputRows - counts.outputRows) + ' rows from the current result.';
      } else if (baseOperation === 'GROUP BY') {
        const columns = ast.groupBy.columns.map(identifier);
        clause = 'GROUP BY ' + columns.join(', ');
        const keys = stage.rows.slice(0, 3).map(function (row) { return columns.map(function (column) { return row[column]; }).join(' / '); }).filter(Boolean);
        happened = 'GROUP BY ' + columns.join(', ') + ' partitions ' + counts.inputRows + ' rows into ' + plural(counts.outputRows, 'group') + '. Aggregate functions are calculated separately for each group.' + (keys.length ? ' Example group keys include ' + keys.join(', ') + '.' : '');
        stats.groups = counts.outputRows;
      } else if (baseOperation === 'HAVING') {
        clause = 'HAVING ' + expression(ast.having);
        happened = 'HAVING ' + expression(ast.having) + ' is evaluated after aggregate values are calculated. ' + counts.outputRows + ' of ' + counts.inputRows + ' groups remain.';
      } else if (baseOperation === 'INNER JOIN' || baseOperation === 'LEFT JOIN') {
        const details = stage.joinDetails;
        clause = baseOperation + ' ' + details.rightName + ' ON ' + details.condition;
        stats.comparisons = details.comparisons; stats.matchedRows = details.matchedRows; stats.unmatchedLeftRows = details.unmatchedRows;
        happened = 'SQLFlow compares ' + details.condition + ' across ' + details.leftName + ' and ' + details.rightName + '. It performs ' + plural(details.comparisons, 'row comparison') + ', finds ' + plural(details.matchedRows, 'matching combination') + ', and produces ' + plural(details.outputRows, 'output row') + '.';
        if (baseOperation === 'LEFT JOIN') { happened += ' Every left row is retained; ' + plural(details.unmatchedRows, 'unmatched left row') + ' receives NULL for the missing right-side values.'; }
      }
      return { stageIndex: stageIndex, operation: baseOperation, title: 'Step ' + (stageIndex + 1) + ' — ' + stage.label, clause: clause, whatHappened: happened, whyItMatters: reason(baseOperation), stats: stats };
    });
    const parts = ['The query starts with ' + plural(result.stages[0].rows.length, 'source row')];
    if (ast.joins.length) { parts.push('combines data through ' + plural(ast.joins.length, 'join')); }
    if (ast.where) { parts.push('keeps rows matching ' + expression(ast.where)); }
    if (ast.groupBy) { parts.push('groups them by ' + ast.groupBy.columns.map(identifier).join(', ')); }
    if (ast.select.all) { parts.push('returns every column'); } else { parts.push('projects ' + selectClause(ast)); }
    if (ast.having) { parts.push('keeps groups matching ' + expression(ast.having)); }
    if (ast.distinct) { parts.push('removes duplicate projected rows'); }
    if (ast.orderBy) { parts.push('sorts by ' + expression(ast.orderBy.expression) + ' ' + ast.orderBy.direction); }
    if (ast.limit) { parts.push('keeps at most ' + ast.limit.count + ' rows'); }
    return { type: 'QueryExplanation', steps: steps, summary: parts.join(', ') + ', and returns ' + plural(result.result.length, 'row') + '.', statementType: 'SELECT' };
  }
  function buildNonSelect(result) {
    const ast = result.ast || {};
    const state = result.transactionState || { active: false, pendingChanges: [], savepoints: [] };
    const type = result.statementType || 'STATEMENT';
    const before = result.stages[0] && result.stages[0].rows ? result.stages[0].rows.length : 0;
    const after = result.stages[result.stages.length - 1] && result.stages[result.stages.length - 1].rows ? result.stages[result.stages.length - 1].rows.length : 0;
    const table = ast.table ? ast.table.name : '';
    let happened = result.message || result.stages.map(function (stage) { return stage.description; }).join(' ');
    let clause = type;
    if (type === 'INSERT') { clause = 'INSERT INTO ' + table; happened = 'SQLFlow inserts one row into ' + table + '. The table changes from ' + before + ' to ' + after + ' rows. Values are supplied for ' + (ast.columns ? ast.columns.map(function (item) { return item.name; }).join(', ') : 'all table columns') + '.'; }
    if (type === 'UPDATE') { clause = 'UPDATE ' + table; happened = 'SQLFlow updates ' + plural(result.affectedRows, 'row') + ' in ' + table + '. SET assigns ' + ast.assignments.map(function (item) { return item.column.name + ' = ' + value(item.value); }).join(', ') + (ast.where ? ' where ' + expression(ast.where) + '.' : '.'); }
    if (type === 'DELETE') { clause = 'DELETE FROM ' + table; happened = 'SQLFlow removes ' + plural(result.affectedRows, 'row') + ' from ' + table + '. The table changes from ' + before + ' to ' + after + ' rows' + (ast.where ? ' after applying ' + expression(ast.where) : ' because no WHERE filter was supplied') + '.'; }
    if (['INSERT', 'UPDATE', 'DELETE'].includes(type)) { happened += state.active ? ' The change is pending in the active transaction.' : ' The change was persisted immediately.'; }
    if (type === 'BEGIN') { happened = 'A new transaction starts. Changes now apply to a working copy and are not permanent until COMMIT.'; }
    if (type === 'SAVEPOINT') { clause = 'SAVEPOINT ' + ast.name; happened = 'A named checkpoint called ' + ast.name + ' is created inside the active transaction. There are now ' + plural(state.savepoints.length, 'savepoint') + '.'; }
    if (type === 'ROLLBACK TO') { clause = 'ROLLBACK TO ' + ast.name; happened = 'The working state is restored to savepoint ' + ast.name + ' while the transaction remains active. ' + plural(state.pendingChanges.length, 'pending change') + ' remains.'; }
    if (type === 'ROLLBACK') { happened = 'All uncommitted changes are discarded and the last committed state is restored. The transaction ends.'; }
    if (type === 'COMMIT') { happened = 'All pending transaction changes are made permanent and the transaction ends.'; }
    const step = { stageIndex: Math.max(0, result.stages.findIndex(function (stage) { return stage.label === type; })), operation: type, title: type, clause: clause, whatHappened: happened, whyItMatters: type === 'BEGIN' ? 'Transactions group related changes so they can be committed or discarded together.' : 'This operation changes data or transaction state in a controlled, visible way.', stats: { rowsBefore: before, rowsAfter: after, affectedRows: result.affectedRows === undefined ? null : result.affectedRows, pendingChanges: state.pendingChanges.length } };
    return { type: 'QueryExplanation', steps: [step], summary: happened, statementType: type };
  }
  function build(result) {
    if (!result || !result.stages) { return { type: 'QueryExplanation', steps: [], summary: 'Run a query to generate its explanation.', statementType: null }; }
    return result.ast && result.ast.type === 'SelectQuery' ? buildSelect(result) : buildNonSelect(result);
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.explanations = { build: build, expression: expression };
})(typeof window !== 'undefined' ? window : globalThis);
