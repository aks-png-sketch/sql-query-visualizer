(function (global) {
  'use strict';

  function tableText(reference) {
    return reference.table.name + (reference.alias ? ' ' + reference.alias.name : '');
  }
  function columnText(reference) {
    return (reference.qualifier ? reference.qualifier + '.' : '') + reference.name;
  }
  function expressionText(expression) {
    if (expression.type === 'AggregateExpression') {
      return expression.functionName + '(' + (expression.argument.type === 'Wildcard' ? '*' : columnText(expression.argument)) + ')';
    }
    return columnText(expression);
  }
  function booleanText(expression) {
    if (!expression) { return ''; }
    if (expression.type === 'GroupedExpression') { return '(' + booleanText(expression.expression) + ')'; }
    if (expression.type === 'LogicalExpression') {
      return booleanText(expression.left) + ' ' + expression.operator + ' ' + booleanText(expression.right);
    }
    const value = expression.right.valueType === 'string' ? "'" + String(expression.right.value).replace(/'/g, "''") + "'" : String(expression.right.value);
    return expressionText(expression.left) + ' ' + expression.operator + ' ' + value;
  }
  function selectionText(ast) {
    if (ast.select.all) { return '*'; }
    return ast.select.expressions.map(expressionText).join(', ');
  }

  function buildQueryPlan(executionResult) {
    if (!executionResult || !executionResult.ast || executionResult.ast.type !== 'SelectQuery') { return null; }
    const ast = executionResult.ast;
    const stages = executionResult.stages;
    let stageCursor = 0;
    let nodeCounter = 0;

    function stageStats(stageIndex) {
      const stage = stages[stageIndex];
      const inputRows = stageIndex === 0 ? stage.rows.length : stages[stageIndex - 1].rows.length;
      const stats = { inputRows: inputRows, outputRows: stage.rows.length };
      if (stage.joinDetails) {
        stats.comparisons = stage.joinDetails.comparisons;
        stats.matches = stage.joinDetails.matchedRows;
        stats.unmatched = stage.joinDetails.unmatchedRows;
      }
      if (stage.label === 'GROUP BY') { stats.groups = stage.rows.length; }
      return stats;
    }
    function node(type, text, stageIndex, children, extraStats) {
      return {
        id: 'plan-node-' + (++nodeCounter), type: type, text: text,
        stageIndex: stageIndex === undefined ? null : stageIndex,
        stats: stageIndex === undefined || stageIndex === null ? (extraStats || null) : stageStats(stageIndex),
        children: children || []
      };
    }
    function consume(expected) {
      const index = stageCursor;
      if (!stages[index] || (typeof expected === 'string' && stages[index].label !== expected)) {
        throw new Error('Could not map logical plan node "' + expected + '" to an execution stage.');
      }
      stageCursor += 1;
      return index;
    }

    const fromIndex = consume('FROM');
    let root = node('FROM', tableText(ast.from), fromIndex, []);
    ast.joins.forEach(function (join) {
      const joinIndex = stageCursor;
      const stage = stages[joinIndex];
      if (!stage || !stage.joinDetails) { throw new Error('Could not map JOIN to an execution stage.'); }
      stageCursor += 1;
      const rightRows = executionResult.parsed.sources.find(function (source) {
        const qualifier = source.alias || source.table.name;
        const requested = join.table.alias ? join.table.alias.name : join.table.table.name;
        return qualifier.toLowerCase() === requested.toLowerCase();
      });
      const rightLeaf = node('TABLE', tableText(join.table), null, [], {
        inputRows: rightRows ? rightRows.table.rows.length : 0,
        outputRows: rightRows ? rightRows.table.rows.length : 0
      });
      const condition = columnText(join.left) + ' = ' + columnText(join.right);
      root = node(join.joinType === 'LEFT' ? 'LEFT JOIN' : 'INNER JOIN', condition, joinIndex, [root, rightLeaf]);
    });
    if (ast.where) { root = node('WHERE', booleanText(ast.where), consume('WHERE'), [root]); }
    if (ast.groupBy) {
      root = node('GROUP BY', ast.groupBy.columns.map(columnText).join(', '), consume('GROUP BY'), [root]);
    }
    const selectStageLabel = executionResult.parsed.hasAggregates ? 'SELECT / AGGREGATE' : 'SELECT';
    const projectNodeType = executionResult.parsed.hasAggregates ? 'PROJECT / AGGREGATE' : 'PROJECT';
    root = node(projectNodeType, selectionText(ast), consume(selectStageLabel), [root]);
    if (ast.having) { root = node('HAVING', booleanText(ast.having), consume('HAVING'), [root]); }
    if (ast.distinct) { root = node('DISTINCT', selectionText(ast), consume('DISTINCT'), [root]); }
    if (ast.orderBy) {
      root = node('ORDER BY', expressionText(ast.orderBy.expression) + ' ' + ast.orderBy.direction, consume('ORDER BY'), [root]);
    }
    if (ast.limit) { root = node('LIMIT', String(ast.limit.count), consume('LIMIT'), [root]); }

    function algebraBase() {
      let algebra = 'FROM ' + tableText(ast.from);
      ast.joins.forEach(function (join) {
        const symbol = join.joinType === 'LEFT' ? '⟕' : '⋈';
        algebra = '(' + algebra + '\n  ' + symbol + ' ' + columnText(join.left) + ' = ' + columnText(join.right) + '\n  ' + tableText(join.table) + ')';
      });
      if (ast.where) { algebra = 'σ ' + booleanText(ast.where) + '\n(\n' + indent(algebra) + '\n)'; }
      if (ast.groupBy || executionResult.parsed.hasAggregates) {
        const groups = ast.groupBy ? ast.groupBy.columns.map(columnText).join(', ') : 'all rows';
        algebra = 'γ ' + groups + '; ' + selectionText(ast) + '\n(\n' + indent(algebra) + '\n)';
      } else {
        algebra = 'π ' + selectionText(ast) + '\n(\n' + indent(algebra) + '\n)';
      }
      if (ast.having) { algebra = 'σ HAVING ' + booleanText(ast.having) + '\n(\n' + indent(algebra) + '\n)'; }
      if (ast.distinct) { algebra = 'δ DISTINCT\n(\n' + indent(algebra) + '\n)'; }
      if (ast.orderBy) { algebra = 'τ ' + expressionText(ast.orderBy.expression) + ' ' + ast.orderBy.direction + '\n(\n' + indent(algebra) + '\n)'; }
      if (ast.limit) { algebra = 'λ LIMIT ' + ast.limit.count + '\n(\n' + indent(algebra) + '\n)'; }
      return algebra;
    }

    return {
      type: 'LogicalQueryPlan',
      root: root,
      algebra: algebraBase(),
      explanation: 'SQL describes the required result. Relational algebra and the query tree show the logical operations used to obtain it.',
      legend: [
        { symbol: 'π', label: 'Projection' }, { symbol: 'σ', label: 'Selection' },
        { symbol: '⋈', label: 'Inner join' }, { symbol: '⟕', label: 'Left join' },
        { symbol: 'γ', label: 'Grouping / aggregation' }, { symbol: 'τ', label: 'Sorting' },
        { symbol: 'δ', label: 'Distinct' }, { symbol: 'λ', label: 'Limit' }
      ]
    };
  }

  function indent(text) { return String(text).split('\n').map(function (line) { return '  ' + line; }).join('\n'); }

  function flattenTree(root) {
    const nodes = [];
    (function visit(current) {
      nodes.push(current);
      current.children.forEach(visit);
    })(root);
    return nodes;
  }

  function copyText(text, clipboard, documentObject) {
    const targetClipboard = clipboard || (global.navigator && global.navigator.clipboard);
    if (targetClipboard && typeof targetClipboard.writeText === 'function') {
      return Promise.resolve(targetClipboard.writeText(String(text))).then(function () { return true; });
    }
    const doc = documentObject || global.document;
    if (!doc || typeof doc.execCommand !== 'function') { return Promise.reject(new Error('Clipboard access is unavailable in this browser.')); }
    const textarea = doc.createElement('textarea');
    textarea.value = String(text);
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    doc.body.appendChild(textarea);
    textarea.select();
    const copied = doc.execCommand('copy');
    textarea.remove();
    return copied ? Promise.resolve(true) : Promise.reject(new Error('Could not copy relational algebra.'));
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.queryplan = {
    buildQueryPlan: buildQueryPlan,
    flattenTree: flattenTree,
    expressionText: expressionText,
    booleanText: booleanText,
    copyText: copyText
  };
})(typeof window !== 'undefined' ? window : globalThis);
