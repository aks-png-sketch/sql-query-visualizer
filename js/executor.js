(function (global) {
  'use strict';

  function cloneRows(rows) { return JSON.parse(JSON.stringify(rows || [])); }
  function lower(value) { return String(value || '').toLowerCase(); }
  function sourceQualifier(source) { return source.alias || source.table.name; }
  function sourceKey(source, column) { return sourceQualifier(source) + '.' + column; }

  // Capture decisions where the real executor makes them. Large traces use an
  // explicit summary rather than claiming that an incomplete replay is complete.
  function trace(columns, rows, estimatedActions) {
    return { inputColumns: columns.slice(), inputRows: cloneRows(rows.length <= 1000 ? rows : rows.slice(0, 20)), actions: [], summaryOnly: rows.length > 1000 || estimatedActions > 2000 };
  }
  function record(traceData, action) { if (!traceData.summaryOnly) { traceData.actions.push(cloneRows(action)); } }
  function displayValue(value) { return value === null || value === undefined ? 'NULL' : typeof value === 'string' ? "'"+value.replace(/'/g,"''")+"'" : String(value); }
  function describeExpression(expression) {
    if(expression.type==='GroupedExpression')return '('+describeExpression(expression.expression)+')';
    if(expression.type==='LogicalExpression')return describeExpression(expression.left)+' '+expression.operator+' '+describeExpression(expression.right);
    return expression.operand.label+' '+expression.operator+' '+displayValue(expression.value);
  }
  function expressionColumns(expression) { if(expression.type==='GroupedExpression')return expressionColumns(expression.expression);if(expression.type==='LogicalExpression')return expressionColumns(expression.left).concat(expressionColumns(expression.right));return expression.operand.key?[expression.operand.key]:[]; }

  function createSource(table, alias) {
    return { table: table, alias: alias ? alias.name : null };
  }

  function addSource(sources, tableReference, database, context) {
    const table = database.resolveTable(tableReference.table.name);
    const source = createSource(table, tableReference.alias);
    const qualifier = sourceQualifier(source);
    if (sources.some(function (existing) { return lower(sourceQualifier(existing)) === lower(qualifier); })) {
      throw new Error('Duplicate table alias or name: "' + qualifier + '". Use a unique alias for each table.');
    }
    if (tableReference.alias && sources.some(function (existing) { return lower(existing.table.name) === lower(tableReference.alias.name); })) {
      throw new Error('Invalid alias "' + tableReference.alias.name + '" in ' + context + ': it conflicts with a participating table name.');
    }
    return source;
  }

  function resolveReference(reference, sources, context) {
    let candidates = sources;
    if (reference.qualifier) {
      candidates = sources.filter(function (source) { return lower(sourceQualifier(source)) === lower(reference.qualifier); });
      if (!candidates.length) {
        throw new Error('Unknown table or alias "' + reference.qualifier + '" in ' + context + '. It may be misspelled or referenced before declaration.');
      }
    }
    const matches = [];
    candidates.forEach(function (source) {
      source.table.columns.forEach(function (column) {
        if (lower(column) === lower(reference.name)) { matches.push({ source: source, column: column }); }
      });
    });
    if (!matches.length) {
      const qualifiedName = reference.qualifier ? reference.qualifier + '.' + reference.name : reference.name;
      throw new Error('Column not found in ' + context + ': "' + qualifiedName + '".');
    }
    if (!reference.qualifier && matches.length > 1) {
      throw new Error('Ambiguous column "' + reference.name + '" in ' + context + '. Qualify it with a table name or alias.');
    }
    const match = matches[0];
    return {
      type: 'Column',
      source: match.source,
      column: match.column,
      key: sourceKey(match.source, match.column),
      label: reference.qualifier ? sourceQualifier(match.source) + '.' + match.column : match.column
    };
  }

  function aggregateLabel(functionName, column) { return functionName + '(' + (column ? column.label : '*') + ')'; }
  function isNumericColumn(source, column) {
    const schemaColumn = source.table.schema && source.table.schema.find(function (item) {
      return lower(item.name) === lower(column);
    });
    if (schemaColumn) { return schemaColumn.type === 'NUMBER' || schemaColumn.type === 'INTEGER'; }
    const values = source.table.rows.map(function (row) { return row[column]; }).filter(function (value) { return value !== null && value !== undefined; });
    return values.length === 0 || values.every(function (value) { return typeof value === 'number' && Number.isFinite(value); });
  }
  function resolveAggregate(expression, sources, context) {
    let column = null;
    if (expression.argument.type !== 'Wildcard') { column = resolveReference(expression.argument, sources, context); }
    if ((expression.functionName === 'SUM' || expression.functionName === 'AVG') && !isNumericColumn(column.source, column.column)) {
      throw new Error(expression.functionName + ' requires a numeric column, but "' + column.label + '" is not numeric.');
    }
    return {
      type: 'Aggregate', functionName: expression.functionName, column: column,
      label: aggregateLabel(expression.functionName, column)
    };
  }
  function resolveValueExpression(expression, sources, context) {
    return expression.type === 'AggregateExpression'
      ? resolveAggregate(expression, sources, context)
      : resolveReference(expression, sources, context);
  }

  function resolveBooleanExpression(expression, sources, context, groupKeys) {
    if (expression.type === 'GroupedExpression') {
      return { type: expression.type, expression: resolveBooleanExpression(expression.expression, sources, context, groupKeys) };
    }
    if (expression.type === 'LogicalExpression') {
      return {
        type: expression.type, operator: expression.operator,
        left: resolveBooleanExpression(expression.left, sources, context, groupKeys),
        right: resolveBooleanExpression(expression.right, sources, context, groupKeys)
      };
    }
    const operand = resolveValueExpression(expression.left, sources, context);
    if (context === 'HAVING' && operand.type === 'Column' && !groupKeys.includes(operand.key)) {
      throw new Error('HAVING column "' + operand.label + '" must appear in GROUP BY or be used inside an aggregate function.');
    }
    return { type: 'ComparisonExpression', operand: operand, operator: expression.operator, value: expression.right.value };
  }

  function wildcardSelections(sources) {
    const counts = {};
    sources.forEach(function (source) {
      source.table.columns.forEach(function (column) { counts[lower(column)] = (counts[lower(column)] || 0) + 1; });
    });
    const joined = sources.length > 1;
    const selections = [];
    sources.forEach(function (source) {
      source.table.columns.forEach(function (column) {
        selections.push({
          type: 'Column', source: source, column: column, key: sourceKey(source, column),
          label: joined && counts[lower(column)] > 1 ? sourceQualifier(source) + '.' + column : column
        });
      });
    });
    return selections;
  }

  function sameAggregate(left, right) {
    return left.functionName === right.functionName && ((!left.column && !right.column) || (left.column && right.column && left.column.key === right.column.key));
  }

  function resolveQuery(ast, database) {
    const sources = [];
    const baseSource = addSource(sources, ast.from, database, 'FROM');
    sources.push(baseSource);
    const resolvedJoins = [];
    ast.joins.forEach(function (join) {
      const previousSources = sources.slice();
      const rightSource = addSource(sources, join.table, database, 'JOIN');
      const availableSources = sources.concat([rightSource]);
      const left = resolveReference(join.left, availableSources, 'JOIN ON');
      const right = resolveReference(join.right, availableSources, 'JOIN ON');
      const newQualifier = lower(sourceQualifier(rightSource));
      const leftIsNew = lower(sourceQualifier(left.source)) === newQualifier;
      const rightIsNew = lower(sourceQualifier(right.source)) === newQualifier;
      if (leftIsNew === rightIsNew) {
        throw new Error('JOIN ON must compare a column from "' + sourceQualifier(rightSource) + '" with a column from an earlier table.');
      }
      resolvedJoins.push({ type: join.joinType, source: rightSource, left: left, right: right, previousSources: previousSources });
      sources.push(rightSource);
    });

    const selections = ast.select.all
      ? wildcardSelections(sources)
      : ast.select.expressions.map(function (expression) { return resolveValueExpression(expression, sources, 'SELECT'); });
    const groupBy = ast.groupBy ? ast.groupBy.columns.map(function (reference) { return resolveReference(reference, sources, 'GROUP BY'); }) : [];
    const groupKeys = groupBy.map(function (column) { return column.key; });
    const hasAggregates = selections.some(function (selection) { return selection.type === 'Aggregate'; });
    const isGroupedQuery = groupBy.length > 0 || hasAggregates;

    if (isGroupedQuery) {
      selections.forEach(function (selection) {
        if (selection.type === 'Column' && !groupKeys.includes(selection.key)) {
          if (groupBy.length) { throw new Error('Selected column "' + selection.label + '" must appear in GROUP BY or be used inside an aggregate function.'); }
          throw new Error('Aggregate queries without GROUP BY may select only aggregate expressions; "' + selection.label + '" is not aggregated.');
        }
      });
    }
    if (ast.having && !isGroupedQuery) { throw new Error('HAVING requires a GROUP BY or aggregate query.'); }

    let orderBy = null;
    if (ast.orderBy) {
      orderBy = resolveValueExpression(ast.orderBy.expression, sources, 'ORDER BY');
      if (orderBy.type === 'Aggregate' && !selections.some(function (selection) { return selection.type === 'Aggregate' && sameAggregate(selection, orderBy); })) {
        throw new Error('ORDER BY aggregate expression "' + orderBy.label + '" must also appear in SELECT.');
      }
      if (isGroupedQuery && orderBy.type === 'Column' && !groupKeys.includes(orderBy.key)) {
        throw new Error('ORDER BY column "' + orderBy.label + '" must appear in GROUP BY for an aggregate query.');
      }
      orderBy.direction = ast.orderBy.direction;
    }

    return {
      sources: sources, baseSource: baseSource, joins: resolvedJoins,
      selections: selections, distinct: ast.distinct,
      where: ast.where ? resolveBooleanExpression(ast.where, sources, 'WHERE', []) : null,
      groupBy: groupBy,
      having: ast.having ? resolveBooleanExpression(ast.having, sources, 'HAVING', groupKeys) : null,
      orderBy: orderBy, limit: ast.limit ? ast.limit.count : null,
      hasAggregates: hasAggregates, isGroupedQuery: isGroupedQuery
    };
  }

  function qualifyRawRow(rawRow, source) {
    const row = {};
    source.table.columns.forEach(function (column) { row[sourceKey(source, column)] = rawRow[column]; });
    return row;
  }
  function nullRow(source) {
    const row = {};
    source.table.columns.forEach(function (column) { row[sourceKey(source, column)] = null; });
    return row;
  }
  function joinedColumns(sources) {
    const columns = [];
    sources.forEach(function (source) { source.table.columns.forEach(function (column) { columns.push(sourceKey(source, column)); }); });
    return columns;
  }
  function simpleDisplay(rows, source) {
    return rows.map(function (row) {
      const visible = {};
      source.table.columns.forEach(function (column) { visible[column] = row[sourceKey(source, column)]; });
      return visible;
    });
  }

  function executeJoin(leftRows, join, sourcesBefore) {
    const rightRows = join.source.table.rows.map(function (row) { return qualifyRawRow(row, join.source); });
    const output = [];
    let matchedRows = 0;
    let unmatchedRows = 0;
    const playback = trace(joinedColumns(sourcesBefore), leftRows, leftRows.length * rightRows.length + leftRows.length);
    playback.kind='JOIN';playback.operation=join.left.label+' = '+join.right.label;
    if (rightRows.length > 1000) { playback.summaryOnly = true; }
    playback.rightColumns = joinedColumns([join.source]);
    playback.rightRows = cloneRows(rightRows.length <= 1000 ? rightRows : rightRows.slice(0, 20));
    playback.highlightColumns = [join.left.key, join.right.key];
    leftRows.forEach(function (leftRow, inputIndex) {
      let matched = false;
      rightRows.forEach(function (rightRow, rightIndex) {
        const combined = Object.assign({}, leftRow, rightRow);
        const leftValue = combined[join.left.key];
        const rightValue = combined[join.right.key];
        const accepted = leftValue !== null && leftValue !== undefined && rightValue !== null && rightValue !== undefined && leftValue === rightValue;
        record(playback, { inputIndex: inputIndex, rightIndex: rightIndex, accepted: accepted, decision:accepted?'Matched':'Rejected', predicateValues:[{label:join.left.label,value:leftValue,operator:'=',compareTo:rightValue,rightLabel:join.right.label,result:accepted,unknown:leftValue===null||rightValue===null}], append: accepted ? combined : null, message: join.left.label + ' = ' + displayValue(leftValue) + '; ' + join.right.label + ' = ' + displayValue(rightValue) + ': ' + (accepted ? 'match, append this actual joined pair.' : 'no match for this pair; the left row may still match another right row.') });
        if (accepted) {
          output.push(combined); matched = true; matchedRows += 1;
        }
      });
      if (!matched && join.type === 'LEFT') { const preserved = Object.assign({}, leftRow, nullRow(join.source)); output.push(preserved); unmatchedRows += 1; record(playback, { inputIndex: inputIndex, accepted: true, decision:'Accepted', nullExtension:true, append: preserved, message: 'Every right candidate was checked and none matched. LEFT JOIN preserves this left row once with NULL right values.' }); }
    });
    return {
      rows: output,
      simulation: playback,
      details: {
        leftName: sourcesBefore.map(function (source) { return sourceQualifier(source); }).join(' + '),
        rightName: sourceQualifier(join.source),
        condition: join.left.label + ' = ' + join.right.label,
        comparisons: leftRows.length * rightRows.length,
        matchedRows: matchedRows,
        unmatchedRows: unmatchedRows,
        outputRows: output.length,
        leftColumns: joinedColumns(sourcesBefore),
        leftRows: cloneRows(leftRows.slice(0, 5)),
        rightColumns: join.source.table.columns.slice(),
        rightRows: cloneRows(join.source.table.rows.slice(0, 5))
      }
    };
  }

  function compareValues(left, operator, right) {
    if (left === null || left === undefined || right === null || right === undefined) { return false; }
    switch (operator) {
      case '=': return left === right;
      case '!=': return left !== right;
      case '>': return left !== null && left !== undefined && left > right;
      case '<': return left !== null && left !== undefined && left < right;
      case '>=': return left !== null && left !== undefined && left >= right;
      case '<=': return left !== null && left !== undefined && left <= right;
      default: throw new Error('Unsupported comparison operator: ' + operator);
    }
  }
  function calculateAggregate(rows, descriptor) {
    if (descriptor.functionName === 'COUNT' && !descriptor.column) { return rows.length; }
    const values = rows.map(function (row) { return row[descriptor.column.key]; }).filter(function (value) { return value !== null && value !== undefined; });
    if (descriptor.functionName === 'COUNT') { return values.length; }
    if (descriptor.functionName === 'SUM') { return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) : null; }
    if (descriptor.functionName === 'AVG') { return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null; }
    if (!values.length) { return null; }
    if (descriptor.functionName === 'MIN') { return values.reduce(function (minimum, value) { return value < minimum ? value : minimum; }); }
    return values.reduce(function (maximum, value) { return value > maximum ? value : maximum; });
  }
  function evaluateRowExpression(row, expression, evidence) {
    if (expression.type === 'ComparisonExpression') { const value=row[expression.operand.key],result=compareValues(value,expression.operator,expression.value);if(evidence)evidence.push({label:expression.operand.label,value:value,operator:expression.operator,compareTo:expression.value,result:result,unknown:value===null||value===undefined});return result; }
    if (expression.type === 'GroupedExpression') { return evaluateRowExpression(row, expression.expression, evidence); }
    return expression.operator === 'AND'
      ? evaluateRowExpression(row, expression.left, evidence) && evaluateRowExpression(row, expression.right, evidence)
      : evaluateRowExpression(row, expression.left, evidence) || evaluateRowExpression(row, expression.right, evidence);
  }
  function valueForGroup(group, operand) {
    if (operand.type === 'Aggregate') { return calculateAggregate(group.rows, operand); }
    return group.rows.length ? group.rows[0][operand.key] : group.keyValues[operand.key];
  }
  function evaluateGroupExpression(group, expression, evidence) {
    if (expression.type === 'ComparisonExpression') { const value=valueForGroup(group,expression.operand),result=compareValues(value,expression.operator,expression.value);if(evidence)evidence.push({label:expression.operand.label,value:value,operator:expression.operator,compareTo:expression.value,result:result,unknown:value===null||value===undefined});return result; }
    if (expression.type === 'GroupedExpression') { return evaluateGroupExpression(group, expression.expression, evidence); }
    return expression.operator === 'AND'
      ? evaluateGroupExpression(group, expression.left, evidence) && evaluateGroupExpression(group, expression.right, evidence)
      : evaluateGroupExpression(group, expression.left, evidence) || evaluateGroupExpression(group, expression.right, evidence);
  }
  function groupRows(rows, columns, onAssign) {
    if (!columns.length) { return [{ keyValues: {}, rows: rows.slice() }]; }
    const groups = new Map();
    rows.forEach(function (row, inputIndex) {
      const key = JSON.stringify(columns.map(function (column) { return row[column.key]; }));
      if (!groups.has(key)) {
        const keyValues = {};
        columns.forEach(function (column) { keyValues[column.key] = row[column.key]; });
        groups.set(key, { keyValues: keyValues, rows: [] });
      }
      groups.get(key).rows.push(row);
      if (onAssign) { onAssign(Array.from(groups.values()), inputIndex, key); }
    });
    return Array.from(groups.values());
  }
  function projectGroup(group, selections) {
    return selections.reduce(function (result, selection) {
      result[selection.label] = selection.type === 'Aggregate' ? calculateAggregate(group.rows, selection) : valueForGroup(group, selection);
      return result;
    }, {});
  }
  function projectRow(row, selections) {
    return selections.reduce(function (result, selection) { result[selection.label] = row[selection.key]; return result; }, {});
  }
  function buildGroupRows(groups, groupBy) {
    return groups.map(function (group) {
      const row = {};
      groupBy.forEach(function (column) { row[column.label] = group.keyValues[column.key]; });
      row.rows_in_group = group.rows.length;
      row.grouped_rows = group.rows.slice(0, 3).map(function (item) {
        return Object.keys(item).slice(0, 3).map(function (key) { return key + '=' + String(item[key]); }).join(', ');
      }).join(' | ') + (group.rows.length > 3 ? ' | …' : '');
      return row;
    });
  }
  function distinctEntries(entries, columns) {
    const seen = new Set();
    return entries.filter(function (entry) {
      const key = JSON.stringify(columns.map(function (column) { return entry.projected[column]; }));
      if (seen.has(key)) { return false; }
      seen.add(key); return true;
    });
  }
  function compareForSort(left, right) {
    if (left === null || left === undefined) { return right === null || right === undefined ? 0 : 1; }
    if (right === null || right === undefined) { return -1; }
    if (typeof left === 'number' && typeof right === 'number') { return left - right; }
    return String(left).localeCompare(String(right));
  }
  function buildStage(label, description, rows, columns, extra) {
    return Object.assign({ label: label, description: description, rows: cloneRows(rows), columns: columns.slice() }, extra || {});
  }
  function aggregateDescription(selections, count) {
    const work = selections.filter(function (selection) { return selection.type === 'Aggregate'; }).map(function (selection) {
      if (selection.functionName === 'COUNT' && !selection.column) { return 'counts all rows'; }
      if (selection.functionName === 'COUNT') { return 'counts non-null ' + selection.column.label + ' values'; }
      return 'calculates ' + selection.label;
    });
    return work.join(', ') + ' across ' + count + ' group' + (count === 1 ? '' : 's') + '.';
  }

  function executeQuery(query, database) {
    const databaseApi = database || global.SqlFlow.database;
    const ast = global.SqlFlow.parser.parseQuery(query);
    const parsed = resolveQuery(ast, databaseApi);
    const stages = [];
    const base = parsed.baseSource;
    let rows = base.table.rows.map(function (row) { return qualifyRawRow(row, base); });
    const fromRows = simpleDisplay(rows, base);
    const fromPlayback = trace(base.table.columns, fromRows);
    fromPlayback.operation='FROM '+base.table.name;
    fromRows.forEach(function (row, index) { record(fromPlayback, { inputIndex: index, accepted: true, append: row, message: 'Introduce source row ' + (index + 1) + ' from ' + base.table.name + '.' }); });
    stages.push(buildStage('FROM', 'Loads all rows from the ' + base.table.name + ' table.', fromRows, base.table.columns, { simulation: fromPlayback }));

    const activeSources = [base];
    parsed.joins.forEach(function (join) {
      const joinResult = executeJoin(rows, join, activeSources);
      rows = joinResult.rows;
      activeSources.push(join.source);
      const joinLabel = join.type + ' JOIN ' + sourceQualifier(join.source);
      const description = join.type === 'LEFT'
        ? 'Keeps every row from ' + joinResult.details.leftName + ' and adds matching data from ' + joinResult.details.rightName + ' where ' + joinResult.details.condition + '.'
        : 'Combines rows from ' + joinResult.details.leftName + ' and ' + joinResult.details.rightName + ' where ' + joinResult.details.condition + '.';
      stages.push(buildStage(joinLabel, description, rows, joinedColumns(activeSources), { joinDetails: joinResult.details, simulation: joinResult.simulation }));
    });

    const workingColumns = parsed.joins.length ? joinedColumns(activeSources) : base.table.columns;
    function visibleWorkingRows(inputRows) { return parsed.joins.length ? inputRows : simpleDisplay(inputRows, base); }
    if (parsed.where) {
      const input = visibleWorkingRows(rows);
      const playback = trace(workingColumns, input);
      playback.operation='WHERE '+describeExpression(parsed.where);playback.highlightColumns=expressionColumns(parsed.where);
      rows = rows.filter(function (row, index) { const evidence=playback.summaryOnly?null:[],accepted = evaluateRowExpression(row, parsed.where,evidence); record(playback, { inputIndex: index, accepted: accepted, decision:accepted?'Accepted':'Rejected', predicateValues:evidence, append: accepted ? input[index] : null, message: 'Input row ' + (index + 1) + (accepted ? ' passes WHERE and is appended.' : ' does not pass WHERE and is rejected.')+' Only actually evaluated comparisons are shown; AND/OR may short-circuit.' }); return accepted; });
      stages.push(buildStage('WHERE', 'Evaluates the WHERE expression after all table joins.', visibleWorkingRows(rows), workingColumns, { simulation: playback }));
    }

    const resultColumns = parsed.selections.map(function (selection) { return selection.label; });
    let entries;
    if (parsed.isGroupedQuery) {
      const groupPlayback = trace(workingColumns, visibleWorkingRows(rows));
      groupPlayback.operation='GROUP BY '+parsed.groupBy.map(function(c){return c.label;}).join(', ');
      if (rows.length > 200) { groupPlayback.summaryOnly = true; }
      let groups = groupRows(rows, parsed.groupBy, groupPlayback.summaryOnly ? null : function (current, index, key) { const bucket=current.findIndex(function(g){return JSON.stringify(parsed.groupBy.map(function(c){return g.keyValues[c.key];}))===key;});const keys=Object.fromEntries(parsed.groupBy.map(function(c){return[c.label,current[bucket].keyValues[c.key]];}));record(groupPlayback, { inputIndex: index, accepted: true, decision:'Grouped', groupKey:keys,bucketIndex:bucket,groupCount:current[bucket].rows.length, output: buildGroupRows(current, parsed.groupBy), message: 'Assign input row ' + (index + 1) + ' to bucket '+(bucket+1)+' using '+JSON.stringify(keys)+'. This bucket now contains '+current[bucket].rows.length+' rows.' }); });
      if (parsed.groupBy.length) {
        const groupColumns = parsed.groupBy.map(function (column) { return column.label; }).concat(['rows_in_group', 'grouped_rows']);
        stages.push(buildStage('GROUP BY', 'Partitions ' + rows.length + ' rows into ' + groups.length + ' groups using ' + parsed.groupBy.map(function (column) { return column.label; }).join(', ') + '.', buildGroupRows(groups, parsed.groupBy), groupColumns, { simulation: groupPlayback }));
      }
      entries = groups.map(function (group) { return { group: group, projected: projectGroup(group, parsed.selections) }; });
      const aggregatePlayback = trace(workingColumns, visibleWorkingRows(rows), rows.length + groups.length);
      aggregatePlayback.operation='SELECT '+resultColumns.join(', ');
      if (rows.length > 200) { aggregatePlayback.summaryOnly = true; }
      if (!aggregatePlayback.summaryOnly) { groups.forEach(function (group, groupIndex) {
        if (parsed.hasAggregates) { group.rows.forEach(function (row, index) {
          const partial = projectGroup({ rows: group.rows.slice(0, index + 1), keyValues: group.keyValues }, parsed.selections);
          const prefix=group.rows.slice(0,index+1),keys=Object.fromEntries(parsed.groupBy.map(function(c){return[c.label,group.keyValues[c.key]];}));const details=parsed.selections.filter(function(s){return s.type==='Aggregate';}).map(function(s){return {label:s.label,consumed:prefix.length,contributing:s.column?prefix.filter(function(r){return r[s.column.key]!==null&&r[s.column.key]!==undefined;}).length:prefix.length,value:partial[s.label]};});
          record(aggregatePlayback, { inputIndex: rows.indexOf(row), accepted: true, decision:'Grouped',groupKey:keys,bucketIndex:groupIndex,aggregateDetails:details,aggregateState: partial, message: 'Group ' + (groupIndex + 1) + ': consumed ' + (index + 1) + ' of '+group.rows.length+' rows. Populated-value contributions are shown separately from consumed rows; COUNT(*) counts rows.' });
        }); }
        record(aggregatePlayback, { accepted: true,decision:'Accepted',bucketIndex:groupIndex,groupKey:Object.fromEntries(parsed.groupBy.map(function(c){return[c.label,group.keyValues[c.key]];})), append: entries[groupIndex].projected, message: 'Group ' + (groupIndex + 1) + ' complete: append its projected result.' });
      }); }
      stages.push(buildStage(
        parsed.hasAggregates ? 'SELECT / AGGREGATE' : 'SELECT',
        parsed.hasAggregates ? aggregateDescription(parsed.selections, groups.length) : 'Projects one result row per group.',
        entries.map(function (entry) { return entry.projected; }), resultColumns, { simulation: aggregatePlayback }
      ));
      if (parsed.having) {
        const havingPlayback = trace(resultColumns, entries.map(function (entry) { return entry.projected; }));
        havingPlayback.operation='HAVING '+describeExpression(parsed.having);
        entries = entries.filter(function (entry, index) { const evidence=havingPlayback.summaryOnly?null:[],accepted = evaluateGroupExpression(entry.group, parsed.having,evidence); record(havingPlayback, { inputIndex: index, accepted: accepted,decision:accepted?'Accepted':'Rejected',predicateValues:evidence, append: accepted ? entry.projected : null, message: 'Completed group ' + (index + 1) + (accepted ? ' passes HAVING and remains.' : ' does not pass HAVING and is rejected.') }); return accepted; });
        stages.push(buildStage('HAVING', 'Filters grouped results; ' + entries.length + ' groups remain.', entries.map(function (entry) { return entry.projected; }), resultColumns, { simulation: havingPlayback }));
      }
    } else {
      entries = rows.map(function (row) { return { source: row, projected: projectRow(row, parsed.selections) }; });
      const playback = trace(workingColumns, visibleWorkingRows(rows));
      playback.operation='SELECT '+resultColumns.join(', ');
      playback.highlightColumns = parsed.selections.map(function (selection) { return selection.key; });
      entries.forEach(function (entry, index) { record(playback, { inputIndex: index, accepted: true, append: entry.projected, message: 'Retain ' + resultColumns.join(', ') + '; hidden source values remain available for ordering.' }); });
      stages.push(buildStage('SELECT', 'Projects only the requested columns.', entries.map(function (entry) { return entry.projected; }), resultColumns, { simulation: playback }));
    }

    if (parsed.distinct) {
      const playback = trace(resultColumns, entries.map(function (entry) { return entry.projected; }));
      playback.operation='DISTINCT on ('+resultColumns.join(', ')+')';const firstOccurrences=new Map();
      const unique = distinctEntries(entries, resultColumns);
      const retained = new Set(unique);
      entries.forEach(function (entry, index) { const accepted = retained.has(entry),key=JSON.stringify(resultColumns.map(function(c){return entry.projected[c];}));if(accepted)firstOccurrences.set(key,index);const first=firstOccurrences.get(key);record(playback, { inputIndex: index, accepted: accepted,decision:accepted?'Accepted':'Duplicate',duplicateOf:accepted?null:first, append: accepted ? entry.projected : null, message: accepted ? 'First occurrence of this projected tuple: retain it.' : 'Same projected tuple as input row '+(first+1)+': exclude this duplicate occurrence.' }); });
      entries = unique;
      stages.push(buildStage('DISTINCT', 'Removes duplicate rows from the projected result.', entries.map(function (entry) { return entry.projected; }), resultColumns, { simulation: playback }));
    }
    if (parsed.orderBy) {
      const beforeSort = entries.slice();
      const positions = new Map(beforeSort.map(function (entry, index) { return [entry, index]; }));
      const playback = trace(resultColumns, entries.map(function (entry) { return entry.projected; }));
      playback.operation='ORDER BY '+parsed.orderBy.label+' '+parsed.orderBy.direction;
      playback.highlightColumns=[parsed.orderBy.label];
      playback.ordering={label:parsed.orderBy.label,direction:parsed.orderBy.direction,keys:beforeSort.map(function(entry,index){return {inputIndex:index,value:parsed.isGroupedQuery?valueForGroup(entry.group,parsed.orderBy):entry.source[parsed.orderBy.key]};})};
      const multiplier = parsed.orderBy.direction === 'DESC' ? -1 : 1;
      entries = entries.slice().sort(function (left, right) {
        const leftValue = parsed.isGroupedQuery ? valueForGroup(left.group, parsed.orderBy) : left.source[parsed.orderBy.key];
        const rightValue = parsed.isGroupedQuery ? valueForGroup(right.group, parsed.orderBy) : right.source[parsed.orderBy.key];
        return compareForSort(leftValue, rightValue) * multiplier;
      });
      entries.forEach(function (entry, index) { const key = parsed.isGroupedQuery ? valueForGroup(entry.group, parsed.orderBy) : entry.source[parsed.orderBy.key]; record(playback, { inputIndex: positions.get(entry), accepted: true,decision:'Accepted',fromPosition:positions.get(entry)+1,toPosition:index+1,orderingKey:key, append: entry.projected, message: 'Move input occurrence ' + (positions.get(entry) + 1) + ' to ordered position ' + (index + 1) + ' using ' + parsed.orderBy.label + '=' + displayValue(key) + ' (' + parsed.orderBy.direction + '). This shows the measured result order, not a physical sorting algorithm.' }); });
      stages.push(buildStage('ORDER BY', 'Sorts rows by ' + parsed.orderBy.label + ' in ' + parsed.orderBy.direction.toLowerCase() + ' order.', entries.map(function (entry) { return entry.projected; }), resultColumns, { simulation: playback }));
    }
    if (parsed.limit !== null) {
      const playback = trace(resultColumns, entries.map(function (entry) { return entry.projected; }));
      playback.operation='LIMIT '+parsed.limit;
      entries.forEach(function (entry, index) { const accepted = index < parsed.limit; record(playback, { inputIndex: index, accepted: accepted,decision:accepted?'Accepted':'Skipped', append: accepted ? entry.projected : null, message: 'Position ' + (index + 1) + (accepted ? ' is within LIMIT ' + parsed.limit + ': admit row.' : ' exceeds LIMIT ' + parsed.limit + ': skip row.') }); });
      entries = entries.slice(0, parsed.limit);
      stages.push(buildStage('LIMIT', 'Keeps only the first ' + parsed.limit + ' rows of the current result.', entries.map(function (entry) { return entry.projected; }), resultColumns, { simulation: playback }));
    }
    return {
      ast: ast, parsed: parsed, sourceTable: base.table, stages: stages,
      result: cloneRows(entries.map(function (entry) { return entry.projected; })), resultColumns: resultColumns
    };
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.executor = {
    executeQuery: executeQuery,
    resolveQuery: resolveQuery,
    calculateAggregate: calculateAggregate,
    evaluateRowExpression: evaluateRowExpression,
    evaluateGroupExpression: evaluateGroupExpression,
    groupRows: groupRows,
    compareValues: compareValues
  };
})(typeof window !== 'undefined' ? window : globalThis);
