(function (global) {
  'use strict';

  const state = {
    active: false,
    committedSnapshot: null,
    workingTables: null,
    savepoints: [],
    pendingChanges: [],
    timeline: []
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalize(value) { return String(value || '').toLowerCase(); }
  function snapshotCommitted() {
    return Object.keys(global.SqlFlow.database.customTables).map(function (name) {
      const table = global.SqlFlow.database.getTable(name);
      return { tableName: table.name, columns: clone(table.schema), rows: clone(table.rows) };
    });
  }
  function snapshotToMap(snapshot) {
    const map = {};
    snapshot.forEach(function (definition) {
      map[definition.tableName] = {
        name: definition.tableName,
        columns: definition.columns.map(function (column) { return column.name; }),
        schema: clone(definition.columns),
        rows: clone(definition.rows),
        isCustom: true
      };
    });
    return map;
  }
  function mapToSnapshot(map) {
    return Object.keys(map).map(function (name) {
      return { tableName: map[name].name, columns: clone(map[name].schema), rows: clone(map[name].rows) };
    });
  }
  function findKey(map, tableName) {
    return Object.keys(map).find(function (name) { return normalize(name) === normalize(tableName); });
  }
  function timeline(type, table, affectedRows, status, message) {
    state.timeline.push({ type: type, table: table || '', affectedRows: affectedRows === undefined ? null : affectedRows, status: status || 'APPLIED', message: message || '' });
  }
  function publicTable(table) { return clone(table); }

  function getDatabaseView() {
    if (!state.active) { return global.SqlFlow.database; }
    return {
      resolveTable: function (tableName) {
        const builtInKey = Object.keys(global.SqlFlow.database.builtInTables).find(function (name) { return normalize(name) === normalize(tableName); });
        if (builtInKey) { return global.SqlFlow.database.getTable(builtInKey); }
        const key = findKey(state.workingTables, tableName);
        if (!key) { throw new Error('Table not found: "' + tableName + '".'); }
        return publicTable(state.workingTables[key]);
      }
    };
  }

  function getMutableTable(tableName) {
    const view = getDatabaseView();
    const table = view.resolveTable(tableName);
    if (!table.isCustom) { throw new Error('Built-in tables are read-only. Create a custom table to modify data.'); }
    return table;
  }
  function saveMutableTable(table) {
    if (state.active) {
      const key = findKey(state.workingTables, table.name);
      if (!key) { throw new Error('Custom table "' + table.name + '" was deleted during the transaction workflow.'); }
      state.workingTables[key] = clone(table);
    } else {
      global.SqlFlow.database.updateCustomTable(table.name, { tableName: table.name, columns: table.schema, rows: table.rows });
    }
  }

  function resolveColumn(table, reference, context) {
    if (reference.qualifier && normalize(reference.qualifier) !== normalize(table.name)) {
      throw new Error('Unknown table or alias "' + reference.qualifier + '" in ' + context + '.');
    }
    const column = table.columns.find(function (name) { return normalize(name) === normalize(reference.name); });
    if (!column) { throw new Error('Column not found in ' + context + ': "' + reference.name + '".'); }
    return column;
  }
  function resolveWhere(expression, table) {
    if (!expression) { return null; }
    if (expression.type === 'GroupedExpression') { return { type: expression.type, expression: resolveWhere(expression.expression, table) }; }
    if (expression.type === 'LogicalExpression') {
      return { type: expression.type, operator: expression.operator, left: resolveWhere(expression.left, table), right: resolveWhere(expression.right, table) };
    }
    return {
      type: 'ComparisonExpression',
      column: resolveColumn(table, expression.left, 'WHERE'),
      operator: expression.operator,
      value: expression.right.value
    };
  }
  function matchesWhere(row, expression) {
    if (!expression) { return true; }
    if (expression.type === 'GroupedExpression') { return matchesWhere(row, expression.expression); }
    if (expression.type === 'LogicalExpression') {
      return expression.operator === 'AND'
        ? matchesWhere(row, expression.left) && matchesWhere(row, expression.right)
        : matchesWhere(row, expression.left) || matchesWhere(row, expression.right);
    }
    return global.SqlFlow.executor.compareValues(row[expression.column], expression.operator, expression.value);
  }
  function schemaColumn(table, columnName) {
    return table.schema.find(function (column) { return normalize(column.name) === normalize(columnName); });
  }
  function typedValue(table, columnName, value, rowIndex) {
    const column = schemaColumn(table, columnName);
    return global.SqlFlow.database.convertValue(value, column.type, column.name, rowIndex || 0);
  }

  function resultStage(label, description, rows, columns) {
    return { label: label, description: description, rows: clone(rows), columns: columns.slice() };
  }
  function mutationResult(label, table, before, after, affectedRows, affectedSnapshot) {
    const scope = state.active ? ' The change is pending in the active transaction.' : ' The change was applied and persisted immediately.';
    return {
      statementType: label,
      stages: [
        resultStage('BEFORE', 'Committed or working table state before the operation.', before, table.columns),
        resultStage(label, label + ' affected ' + affectedRows + ' row' + (affectedRows === 1 ? '' : 's') + '.' + scope, affectedSnapshot, table.columns),
        resultStage('AFTER', 'Table state after the operation.', after, table.columns)
      ],
      result: clone(after), resultColumns: table.columns.slice(), parsed: { orderBy: null }, affectedRows: affectedRows
    };
  }
  function controlResult(label, message) {
    return {
      statementType: label,
      stages: [resultStage(label, message, [{ status: state.active ? 'ACTIVE' : 'INACTIVE', message: message }], ['status', 'message'])],
      result: [{ status: state.active ? 'ACTIVE' : 'INACTIVE', message: message }],
      resultColumns: ['status', 'message'], parsed: { orderBy: null }, message: message
    };
  }
  function snapshotSummaryRows(snapshot) {
    return snapshot.map(function (table) { return { table: table.tableName, row_count: table.rows.length }; });
  }
  function transitionResult(label, message, beforeSnapshot, afterSnapshot) {
    const beforeRows = snapshotSummaryRows(beforeSnapshot);
    const afterRows = snapshotSummaryRows(afterSnapshot);
    return {
      statementType: label,
      stages: [
        resultStage('BEFORE', 'Transaction working state before ' + label + '.', beforeRows, ['table', 'row_count']),
        resultStage(label, message, afterRows, ['table', 'row_count']),
        resultStage('AFTER', 'Committed and working state after ' + label + '.', afterRows, ['table', 'row_count'])
      ],
      result: afterRows,
      resultColumns: ['table', 'row_count'], parsed: { orderBy: null }, message: message
    };
  }

  function executeInsert(ast) {
    const table = getMutableTable(ast.table.name);
    const before = clone(table.rows);
    const requestedColumns = ast.columns ? ast.columns.map(function (identifier) { return resolveColumn(table, { name: identifier.name, qualifier: null }, 'INSERT'); }) : table.columns.slice();
    const seen = new Set();
    requestedColumns.forEach(function (column) {
      const key = normalize(column);
      if (seen.has(key)) { throw new Error('Duplicate INSERT column: "' + column + '".'); }
      seen.add(key);
    });
    if (requestedColumns.length !== ast.values.length) {
      throw new Error('INSERT column count does not match the number of VALUES. Expected ' + requestedColumns.length + ' values but received ' + ast.values.length + '.');
    }
    const row = {};
    table.schema.forEach(function (column) { row[column.name] = column.type === 'TEXT' ? '' : null; });
    requestedColumns.forEach(function (column, index) { row[column] = typedValue(table, column, ast.values[index].value, table.rows.length); });
    table.rows.push(row);
    saveMutableTable(table);
    if (state.active) { state.pendingChanges.push({ type: 'INSERT', table: table.name, affectedRows: 1 }); }
    timeline('INSERT', table.name, 1, state.active ? 'PENDING' : 'COMMITTED');
    return mutationResult('INSERT', table, before, table.rows, 1, [row]);
  }

  function executeUpdate(ast) {
    const table = getMutableTable(ast.table.name);
    const before = clone(table.rows);
    const seen = new Set();
    const assignments = ast.assignments.map(function (assignment) {
      const column = resolveColumn(table, { name: assignment.column.name, qualifier: null }, 'UPDATE');
      if (seen.has(normalize(column))) { throw new Error('Duplicate UPDATE column: "' + column + '".'); }
      seen.add(normalize(column));
      return { column: column, value: typedValue(table, column, assignment.value.value, 0) };
    });
    const where = resolveWhere(ast.where, table);
    const affected = [];
    table.rows.forEach(function (row) {
      if (matchesWhere(row, where)) {
        assignments.forEach(function (assignment) { row[assignment.column] = assignment.value; });
        affected.push(clone(row));
      }
    });
    saveMutableTable(table);
    if (state.active) { state.pendingChanges.push({ type: 'UPDATE', table: table.name, affectedRows: affected.length }); }
    timeline('UPDATE', table.name, affected.length, state.active ? 'PENDING' : 'COMMITTED');
    return mutationResult('UPDATE', table, before, table.rows, affected.length, affected);
  }

  function executeDelete(ast, options) {
    if (!ast.where && !(options && options.confirmedDeleteAll)) {
      throw new Error('DELETE without WHERE requires confirmation before all rows can be removed.');
    }
    const table = getMutableTable(ast.table.name);
    const before = clone(table.rows);
    const where = resolveWhere(ast.where, table);
    const removed = [];
    table.rows = table.rows.filter(function (row) {
      if (matchesWhere(row, where)) { removed.push(clone(row)); return false; }
      return true;
    });
    saveMutableTable(table);
    if (state.active) { state.pendingChanges.push({ type: 'DELETE', table: table.name, affectedRows: removed.length }); }
    timeline('DELETE', table.name, removed.length, state.active ? 'PENDING' : 'COMMITTED');
    return mutationResult('DELETE', table, before, table.rows, removed.length, removed);
  }

  function begin() {
    if (state.active) { throw new Error('A transaction is already active. Commit or roll it back before starting another.'); }
    state.committedSnapshot = snapshotCommitted();
    state.workingTables = snapshotToMap(state.committedSnapshot);
    state.active = true;
    state.savepoints = [];
    state.pendingChanges = [];
    state.timeline = [];
    timeline('BEGIN', '', null, 'ACTIVE');
    return controlResult('BEGIN', 'Transaction started. Changes now use an isolated working copy.');
  }
  function commit() {
    if (!state.active) { throw new Error('COMMIT requires an active transaction.'); }
    Object.keys(state.workingTables).forEach(function (name) {
      if (!global.SqlFlow.database.customTables[name] && !Object.keys(global.SqlFlow.database.customTables).some(function (existing) { return normalize(existing) === normalize(name); })) {
        throw new Error('Custom table "' + name + '" was deleted during the transaction workflow. Roll back and retry.');
      }
    });
    const previousCommitted = snapshotCommitted();
    const beforeSnapshot = mapToSnapshot(state.workingTables);
    global.SqlFlow.database.replaceCustomTables(beforeSnapshot);
    if (global.SqlFlow.database.getLastStorageError()) {
      global.SqlFlow.database.replaceCustomTables(previousCommitted, { persist: false });
      throw new Error('COMMIT could not persist the transaction: ' + global.SqlFlow.database.getLastStorageError());
    }
    timeline('COMMIT', '', null, 'COMMITTED');
    state.timeline.forEach(function (event) { if (event.status === 'PENDING') { event.status = 'COMMITTED'; } });
    state.active = false;
    state.committedSnapshot = null;
    state.workingTables = null;
    state.savepoints = [];
    state.pendingChanges = [];
    return transitionResult('COMMIT', 'Transaction committed. All changes are now permanent.', beforeSnapshot, snapshotCommitted());
  }
  function rollback() {
    if (!state.active) { throw new Error('ROLLBACK requires an active transaction.'); }
    const beforeSnapshot = mapToSnapshot(state.workingTables);
    const restoredSnapshot = clone(state.committedSnapshot);
    timeline('ROLLBACK', '', null, 'ROLLED BACK');
    state.timeline.forEach(function (event) { if (event.status === 'PENDING') { event.status = 'ROLLED BACK'; } });
    state.active = false;
    state.committedSnapshot = null;
    state.workingTables = null;
    state.savepoints = [];
    state.pendingChanges = [];
    return transitionResult('ROLLBACK', 'Transaction rolled back. Uncommitted changes were discarded.', beforeSnapshot, restoredSnapshot);
  }
  function savepoint(name) {
    if (!state.active) { throw new Error('SAVEPOINT requires an active transaction.'); }
    const normalized = normalize(name);
    const existingIndex = state.savepoints.findIndex(function (item) { return normalize(item.name) === normalized; });
    if (existingIndex !== -1) { state.savepoints = state.savepoints.slice(0, existingIndex); }
    state.savepoints.push({ name: name, tables: clone(state.workingTables), pendingLength: state.pendingChanges.length, timelineIndex: state.timeline.length });
    timeline('SAVEPOINT', name, null, 'ACTIVE');
    return controlResult('SAVEPOINT', 'Savepoint "' + name + '" created.');
  }
  function rollbackTo(name) {
    if (!state.active) { throw new Error('ROLLBACK TO SAVEPOINT requires an active transaction.'); }
    const index = state.savepoints.findIndex(function (item) { return normalize(item.name) === normalize(name); });
    if (index === -1) { throw new Error('Unknown savepoint: "' + name + '".'); }
    const beforeSnapshot = mapToSnapshot(state.workingTables);
    const selected = state.savepoints[index];
    state.timeline.forEach(function (event, eventIndex) {
      if (eventIndex > selected.timelineIndex && event.status === 'PENDING') { event.status = 'ROLLED BACK'; }
      if (eventIndex > selected.timelineIndex && event.type === 'SAVEPOINT' && event.status === 'ACTIVE') { event.status = 'DISCARDED'; }
    });
    state.workingTables = clone(selected.tables);
    state.pendingChanges = state.pendingChanges.slice(0, selected.pendingLength);
    state.savepoints = state.savepoints.slice(0, index + 1);
    timeline('ROLLBACK TO', name, null, 'ACTIVE');
    return transitionResult('ROLLBACK TO', 'Transaction restored to savepoint "' + name + '".', beforeSnapshot, mapToSnapshot(state.workingTables));
  }

  function execute(ast, options) {
    let result;
    if (ast.type === 'InsertStatement') { result = executeInsert(ast); }
    else if (ast.type === 'UpdateStatement') { result = executeUpdate(ast); }
    else if (ast.type === 'DeleteStatement') { result = executeDelete(ast, options); }
    else if (ast.type === 'BeginStatement') { result = begin(); }
    else if (ast.type === 'CommitStatement') { result = commit(); }
    else if (ast.type === 'RollbackStatement') { result = rollback(); }
    else if (ast.type === 'SavepointStatement') { result = savepoint(ast.name); }
    else if (ast.type === 'RollbackToStatement') { result = rollbackTo(ast.name); }
    else { throw new Error('Unsupported data-modification or transaction statement.'); }
    result.ast = ast;
    result.transactionState = getState();
    return result;
  }
  function getState() {
    const committed = snapshotCommitted();
    const working = state.active ? mapToSnapshot(state.workingTables) : committed;
    return {
      active: state.active,
      savepoints: state.savepoints.map(function (item) { return item.name; }),
      pendingChanges: clone(state.pendingChanges),
      timeline: clone(state.timeline),
      committedState: committed.map(function (table) { return { table: table.tableName, rows: table.rows.length }; }),
      workingState: working.map(function (table) { return { table: table.tableName, rows: table.rows.length }; })
    };
  }
  function resetForTests() {
    state.active = false; state.committedSnapshot = null; state.workingTables = null;
    state.savepoints = []; state.pendingChanges = []; state.timeline = [];
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.transactions = {
    execute: execute,
    begin: begin,
    commit: commit,
    rollback: rollback,
    savepoint: savepoint,
    rollbackTo: rollbackTo,
    getDatabaseView: getDatabaseView,
    getState: getState,
    resetForTests: resetForTests
  };
})(typeof window !== 'undefined' ? window : globalThis);
