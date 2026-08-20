(function (global) {
  'use strict';

  function register(h) {
    const test = h.test;
    const assert = h.assert;
    const execute = h.execute;
    const parser = global.SqlFlow.parser;
    const database = global.SqlFlow.database;
    const executor = global.SqlFlow.executor;
    const transactions = global.SqlFlow.transactions;
    const visualizer = global.SqlFlow.visualizer;
    const explanations = global.SqlFlow.explanations;

    function sameRows(actual, expected, message) {
      assert(JSON.stringify(actual) === JSON.stringify(expected), message + '\nExpected ' + JSON.stringify(expected) + '\nReceived ' + JSON.stringify(actual));
    }
    function quoted(value) { return "'" + String(value).replace(/'/g, "''") + "'"; }
    function compare(left, operator, right) {
      if (operator === '=') { return left === right; }
      if (operator === '!=') { return left !== right; }
      if (operator === '>') { return left > right; }
      if (operator === '<') { return left < right; }
      if (operator === '>=') { return left >= right; }
      return left <= right;
    }
    function executeStatement(sql, options) {
      const ast = parser.parseStatement(sql);
      if (ast.type === 'SelectQuery') { return executor.executeQuery(sql, transactions.getDatabaseView()); }
      return transactions.execute(ast, options || {});
    }
    function explain(sql) {
      const result = execute(sql);
      result.explanation = explanations.build(result);
      return result;
    }
    function cleanup(name) {
      transactions.resetForTests();
      if (database.customTables[name]) { database.deleteCustomTable(name); }
    }
    function createStressTable(name) {
      cleanup(name);
      return database.createCustomTable({
        tableName: name,
        columns: [{ name: 'id', type: 'INTEGER' }, { name: 'category', type: 'TEXT' }, { name: 'score', type: 'NUMBER' }],
        rows: [
          { id: 1, category: 'A', score: 10 }, { id: 2, category: 'A', score: 20 },
          { id: 3, category: 'B', score: 20 }, { id: 4, category: 'B', score: 40 }
        ]
      }, { persist: false });
    }

    const tableNames = ['students', 'courses', 'enrollments', 'departments'];
    tableNames.forEach(function (tableName) {
      const table = database.getTable(tableName);
      table.columns.forEach(function (column) {
        ['canonical', 'uppercase'].forEach(function (variant) {
          test('Stress basic projection: ' + tableName + '.' + column + ' ' + variant, function () {
            const sql = 'SELECT ' + (variant === 'uppercase' ? column.toUpperCase() : column) + ' FROM ' + (variant === 'uppercase' ? tableName.toUpperCase() : tableName) + ';';
            const result = execute(sql);
            sameRows(result.result, table.rows.map(function (row) { const projected = {}; projected[column] = row[column]; return projected; }), 'Projection must preserve exact source values.');
          });
        });
      });
      for (let variation = 0; variation < 4; variation += 1) {
        test('Stress SELECT star formatting: ' + tableName + ' variation ' + (variation + 1), function () {
          const forms = ['SELECT * FROM ' + tableName + ';', ' select\t*\nfrom\t' + tableName + ' ', 'SeLeCt * FrOm ' + tableName.toUpperCase() + ';', '\n\nSELECT  *  FROM  ' + tableName + '\n;  '];
          const result = execute(forms[variation]);
          sameRows(result.result, table.rows, 'SELECT * variation must return exact table data.');
          assert(result.resultColumns.join(',') === table.columns.join(','), 'SELECT * must preserve schema order.');
        });
      }
    });

    const numericCases = [];
    tableNames.forEach(function (tableName) {
      const table = database.getTable(tableName);
      table.schema.filter(function (column) { return column.type !== 'TEXT'; }).forEach(function (column) {
        const values = table.rows.map(function (row) { return row[column.name]; });
        const thresholds = [Math.min.apply(null, values), values[Math.floor(values.length / 2)], Math.max.apply(null, values)];
        ['=', '!=', '>', '<', '>=', '<='].forEach(function (operator, operatorIndex) {
          numericCases.push({ table: table, column: column.name, operator: operator, threshold: thresholds[operatorIndex % thresholds.length] });
        });
      });
    });
    numericCases.forEach(function (item, index) {
      test('Stress numeric WHERE exact result ' + (index + 1) + ': ' + item.table.name + '.' + item.column + ' ' + item.operator, function () {
        const result = execute('SELECT ' + item.column + ' FROM ' + item.table.name + ' WHERE ' + item.column + ' ' + item.operator + ' ' + item.threshold + ';');
        const expected = item.table.rows.filter(function (row) { return compare(row[item.column], item.operator, item.threshold); }).map(function (row) { const output = {}; output[item.column] = row[item.column]; return output; });
        sameRows(result.result, expected, 'Numeric predicate must return exact matching values.');
        const where = result.stages.find(function (stage) { return stage.label === 'WHERE'; });
        assert(where.rows.length === expected.length, 'WHERE stage count must equal final projected count.');
      });
    });

    const stringCases = [];
    tableNames.forEach(function (tableName) {
      const table = database.getTable(tableName);
      table.schema.filter(function (column) { return column.type === 'TEXT'; }).forEach(function (column) {
        const first = table.rows[0][column.name];
        const last = table.rows[table.rows.length - 1][column.name];
        stringCases.push({ table: table, column: column.name, operator: '=', value: first });
        stringCases.push({ table: table, column: column.name, operator: '!=', value: last });
        stringCases.push({ table: table, column: column.name, operator: '=', value: '__no_match__' });
      });
    });
    stringCases.forEach(function (item, index) {
      test('Stress string WHERE exact result ' + (index + 1) + ': ' + item.table.name + '.' + item.column, function () {
        const result = execute('SELECT ' + item.column + ' FROM ' + item.table.name + ' WHERE ' + item.column + ' ' + item.operator + ' ' + quoted(item.value) + ';');
        const expectedValues = item.table.rows.filter(function (row) { return compare(row[item.column], item.operator, item.value); }).map(function (row) { return row[item.column]; });
        assert(result.result.length === expectedValues.length, 'String predicate row count must be exact.');
        assert(result.result.every(function (row, rowIndex) { return row[item.column] === expectedValues[rowIndex]; }), 'String predicate values must remain exact.');
      });
    });

    const booleanPredicates = [
      { sql: 'cgpa >= 8 AND year >= 2', match: function (r) { return r.cgpa >= 8 && r.year >= 2; } },
      { sql: 'cgpa > 9 OR year = 1', match: function (r) { return r.cgpa > 9 || r.year === 1; } },
      { sql: '(cgpa >= 8 AND year <= 2) OR city = \'Mumbai\'', match: function (r) { return (r.cgpa >= 8 && r.year <= 2) || r.city === 'Mumbai'; } },
      { sql: 'cgpa >= 0 AND (year = 1 OR (year = 2 OR year = 3))', match: function (r) { return r.cgpa >= 0 && (r.year === 1 || r.year === 2 || r.year === 3); } },
      { sql: '(cgpa > 100 OR year < 0) AND city != \'Boston\'', match: function (r) { return (r.cgpa > 100 || r.year < 0) && r.city !== 'Boston'; } },
      { sql: 'year >= 1 OR cgpa < 0 AND city = \'none\'', match: function (r) { return r.year >= 1 || (r.cgpa < 0 && r.city === 'none'); } }
    ];
    for (let repeat = 0; repeat < 5; repeat += 1) {
      booleanPredicates.forEach(function (item, index) {
        test('Stress Boolean precedence exact values ' + (repeat * booleanPredicates.length + index + 1), function () {
          const result = execute('SELECT student_id, name FROM students WHERE ' + item.sql + ';');
          const expected = database.getTable('students').rows.filter(item.match).map(function (row) { return { student_id: row.student_id, name: row.name }; });
          sameRows(result.result, expected, 'Nested Boolean predicate must honor parentheses and AND precedence.');
        });
      });
    }

    const formatBases = [
      'SELECT name, cgpa FROM students WHERE cgpa >= 8 ORDER BY cgpa DESC LIMIT 4;',
      'SELECT DISTINCT department FROM students ORDER BY department ASC;',
      'SELECT course_name, credits FROM courses WHERE credits >= 3 ORDER BY course_name;',
      'SELECT semester, COUNT(*) FROM enrollments GROUP BY semester ORDER BY COUNT(*) DESC;',
      'SELECT department, AVG(cgpa) FROM students GROUP BY department HAVING AVG(cgpa) >= 8;'
    ];
    const formatters = [
      function (sql) { return sql; }, function (sql) { return sql.toLowerCase(); }, function (sql) { return sql.toUpperCase(); },
      function (sql) { return '  \n' + sql + '  \n'; }, function (sql) { return sql.replace(/ /g, '\t'); },
      function (sql) { return sql.replace(/ FROM /i, '\nFROM\n').replace(/ WHERE /i, '\nWHERE\n').replace(/ ORDER BY /i, '\nORDER\nBY\n'); }
    ];
    formatBases.forEach(function (base, baseIndex) {
      const expected = execute(base);
      formatters.forEach(function (formatter, variantIndex) {
        test('Stress whitespace/case equivalence ' + (baseIndex + 1) + '.' + (variantIndex + 1), function () {
          const result = execute(formatter(base));
          sameRows(result.result, expected.result, 'Formatting must not change result data.');
          assert(result.stages.map(function (stage) { return stage.label; }).join('|') === expected.stages.map(function (stage) { return stage.label; }).join('|'), 'Formatting must not change execution stages.');
        });
      });
    });

    const orderColumns = ['student_id', 'name', 'department', 'cgpa', 'year', 'city'];
    orderColumns.forEach(function (column) {
      ['ASC', 'DESC'].forEach(function (direction) {
        [0, 1, 3, 10, 20].forEach(function (limit) {
          test('Stress ORDER/LIMIT invariant ' + column + ' ' + direction + ' ' + limit, function () {
            const result = execute('SELECT ' + column + ' FROM students ORDER BY ' + column + ' ' + direction + ' LIMIT ' + limit + ';');
            const expected = database.getTable('students').rows.slice().sort(function (a, b) {
              const comparison = typeof a[column] === 'number' ? a[column] - b[column] : String(a[column]).localeCompare(String(b[column]));
              return direction === 'DESC' ? -comparison : comparison;
            }).slice(0, limit).map(function (row) { const item = {}; item[column] = row[column]; return item; });
            sameRows(result.result, expected, 'ORDER BY and LIMIT must return exact ordered values.');
            assert(result.result.length <= limit, 'LIMIT must cap the row count.');
          });
        });
      });
    });

    const distinctQueries = [
      'SELECT DISTINCT department FROM students;', 'SELECT DISTINCT year FROM students;', 'SELECT DISTINCT city FROM students;',
      'SELECT DISTINCT department, year FROM students;', 'SELECT DISTINCT semester FROM enrollments;', 'SELECT DISTINCT grade FROM enrollments;',
      'SELECT DISTINCT semester, grade FROM enrollments;', 'SELECT DISTINCT department FROM courses;', 'SELECT DISTINCT credits FROM courses;',
      'SELECT DISTINCT building FROM departments;', 'SELECT DISTINCT department FROM students WHERE cgpa >= 8;',
      'SELECT DISTINCT department FROM students ORDER BY department LIMIT 3;'
    ];
    distinctQueries.forEach(function (sql, index) {
      test('Stress DISTINCT uniqueness and stage counts ' + (index + 1), function () {
        const result = execute(sql);
        const keys = result.result.map(function (row) { return JSON.stringify(row); });
        assert(new Set(keys).size === keys.length, 'DISTINCT output must contain no duplicate projected rows.');
        const stage = result.stages.find(function (item) { return item.label === 'DISTINCT'; });
        const previous = result.stages[result.stages.indexOf(stage) - 1];
        assert(stage.rows.length <= previous.rows.length, 'DISTINCT cannot increase row count.');
      });
    });

    const aggregateCases = [
      { fn: 'COUNT(*)', expected: function (rows) { return rows.length; } },
      { fn: 'COUNT(cgpa)', expected: function (rows) { return rows.length; } },
      { fn: 'SUM(year)', expected: function (rows) { return rows.reduce(function (s, r) { return s + r.year; }, 0); } },
      { fn: 'AVG(cgpa)', expected: function (rows) { return rows.reduce(function (s, r) { return s + r.cgpa; }, 0) / rows.length; } },
      { fn: 'MIN(cgpa)', expected: function (rows) { return Math.min.apply(null, rows.map(function (r) { return r.cgpa; })); } },
      { fn: 'MAX(cgpa)', expected: function (rows) { return Math.max.apply(null, rows.map(function (r) { return r.cgpa; })); } }
    ];
    const aggregateFilters = [null, 'year >= 2', 'cgpa > 8', 'city = \'Mumbai\''];
    aggregateCases.forEach(function (aggregate) {
      aggregateFilters.forEach(function (filter, index) {
        test('Stress implicit aggregate exact result ' + aggregate.fn + ' filter ' + (index + 1), function () {
          const sql = 'SELECT ' + aggregate.fn + ' FROM students' + (filter ? ' WHERE ' + filter : '') + ';';
          const source = filter ? execute('SELECT * FROM students WHERE ' + filter + ';').result : database.getTable('students').rows;
          const result = execute(sql);
          assert(result.result.length === 1 && result.result[0][aggregate.fn] === aggregate.expected(source), 'Aggregate must equal independently calculated value.');
        });
      });
    });

    ['year', 'department', 'city'].forEach(function (groupColumn) {
      ['COUNT(*)', 'MIN(cgpa)', 'MAX(cgpa)', 'AVG(cgpa)'].forEach(function (aggregate) {
        test('Stress grouped aggregate consistency ' + groupColumn + ' ' + aggregate, function () {
          const result = execute('SELECT ' + groupColumn + ', ' + aggregate + ' FROM students GROUP BY ' + groupColumn + ' ORDER BY ' + groupColumn + ';');
          const expectedGroups = new Map();
          database.getTable('students').rows.forEach(function (row) { if (!expectedGroups.has(row[groupColumn])) { expectedGroups.set(row[groupColumn], []); } expectedGroups.get(row[groupColumn]).push(row); });
          assert(result.result.length === expectedGroups.size, 'GROUP BY must create one row per exact key.');
          result.result.forEach(function (row) {
            const values = expectedGroups.get(row[groupColumn]);
            let expected;
            if (aggregate === 'COUNT(*)') { expected = values.length; }
            else if (aggregate.indexOf('MIN') === 0) { expected = Math.min.apply(null, values.map(function (r) { return r.cgpa; })); }
            else if (aggregate.indexOf('MAX') === 0) { expected = Math.max.apply(null, values.map(function (r) { return r.cgpa; })); }
            else { expected = values.reduce(function (sum, r) { return sum + r.cgpa; }, 0) / values.length; }
            assert(row[aggregate] === expected, 'Grouped aggregate must match independent calculation for ' + row[groupColumn] + '.');
          });
        });
      });
    });

    const joinQueries = [
      'SELECT s.student_id, e.enrollment_id FROM students s JOIN enrollments e ON s.student_id = e.student_id;',
      'SELECT s.name, e.grade FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id ORDER BY s.name;',
      'SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.student_id = e.student_id;',
      'SELECT e.enrollment_id, c.course_name FROM enrollments e JOIN courses c ON e.course_id = c.course_id;',
      'SELECT s.name, c.course_name FROM students s JOIN enrollments e ON s.student_id = e.student_id JOIN courses c ON e.course_id = c.course_id;',
      'SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id WHERE e.grade = \'A\';',
      'SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id ORDER BY e.grade DESC LIMIT 4;',
      'SELECT s.department, COUNT(*) FROM students s JOIN enrollments e ON s.student_id = e.student_id GROUP BY s.department;',
      'SELECT s.department, COUNT(*) FROM students s JOIN enrollments e ON s.student_id = e.student_id GROUP BY s.department HAVING COUNT(*) >= 2;',
      'SELECT DISTINCT s.department FROM students s JOIN enrollments e ON s.student_id = e.student_id;'
    ];
    for (let repeat = 0; repeat < 3; repeat += 1) {
      joinQueries.forEach(function (sql, index) {
        test('Stress JOIN metadata and representation ' + (repeat * joinQueries.length + index + 1), function () {
          const result = explain(sql);
          const joinStages = result.stages.filter(function (stage) { return Boolean(stage.joinDetails); });
          assert(joinStages.length >= 1, 'Expected JOIN stages.');
          joinStages.forEach(function (stage) {
            const details = stage.joinDetails;
            assert(details.comparisons > 0 && details.comparisons >= details.matchedRows, 'JOIN comparison count must be positive and cover all matches.');
            assert(details.outputRows === stage.rows.length, 'JOIN output metadata must match stage rows.');
          });
          result.queryPlan = global.SqlFlow.queryplan.buildQueryPlan(result);
          assert(global.SqlFlow.queryplan.flattenTree(result.queryPlan.root).some(function (node) { return node.type.indexOf('JOIN') !== -1; }), 'Query tree must contain JOIN.');
          assert(result.explanation.steps.filter(function (step) { return step.operation.indexOf('JOIN') !== -1; }).length === joinStages.length, 'Explanation must map every JOIN.');
        });
      });
    }

    const invalidQueries = [
      'name FROM students;', 'SELECT;', 'SELECT name;', 'SELECT FROM students;', 'SELECT name students;',
      'SELECT name FROM;', 'SELECT name FROM missing;', 'SELECT bogus FROM students;', 'SELECT name, FROM students;',
      'SELECT name FROM students WHERE;', 'SELECT name FROM students WHERE cgpa;', 'SELECT name FROM students WHERE cgpa =;',
      'SELECT name FROM students WHERE = 8;', 'SELECT name FROM students WHERE (cgpa > 8;', 'SELECT name FROM students WHERE cgpa > 8);',
      'SELECT name FROM students WHERE cgpa > 8 AND;', 'SELECT name FROM students WHERE OR cgpa > 8;',
      'SELECT s.name FROM students s JOIN enrollments e;', 'SELECT s.name FROM students s JOIN enrollments e ON;',
      'SELECT s.name FROM students s JOIN enrollments e ON s.student_id;', 'SELECT s.name FROM students s JOIN enrollments e ON s.student_id > e.student_id;',
      'SELECT name FROM students GROUP;', 'SELECT name FROM students GROUP BY;', 'SELECT year, COUNT(*) FROM students GROUP BY year HAVING;',
      'SELECT name FROM students ORDER;', 'SELECT name FROM students ORDER BY;', 'SELECT name FROM students LIMIT;',
      'SELECT name FROM students LIMIT -1;', 'SELECT name FROM students LIMIT 1.5;', 'SELECT name FROM students LIMIT three;',
      'INSERT INTO employees;', 'INSERT INTO employees VALUES;', 'UPDATE employees;', 'UPDATE employees SET;',
      'DELETE;', 'DELETE FROM;', 'SAVEPOINT;', 'ROLLBACK TO;', 'FLY TO students;'
    ];
    invalidQueries.forEach(function (sql, index) {
      test('Stress friendly parser/validation error ' + (index + 1), function () {
        let error = null;
        try { executeStatement(sql); } catch (caught) { error = caught; }
        assert(error && typeof error.message === 'string' && error.message.length > 5, 'Invalid SQL must produce a useful error.');
        visualizer.showExecutionResult(explain('SELECT name FROM students LIMIT 1;'));
        visualizer.showError(error.message);
        assert(visualizer.state.executionResult === null && document.getElementById('explanationContainer').textContent === '' && document.getElementById('queryTreeContainer').textContent === '', 'Error must clear all prior representations.');
      });
    });

    for (let index = 0; index < 20; index += 1) {
      test('Stress explanation metadata agreement ' + (index + 1), function () {
        const limits = [0, 1, 3, 5, 10];
        const result = explain('SELECT name, cgpa FROM students WHERE cgpa >= ' + (7 + (index % 4)) + ' ORDER BY cgpa ' + (index % 2 ? 'ASC' : 'DESC') + ' LIMIT ' + limits[index % limits.length] + ';');
        result.explanation.steps.forEach(function (step) {
          const stage = result.stages[step.stageIndex];
          assert(step.stats.outputRows === stage.rows.length, 'Explanation output count must match stage rows.');
          assert(step.stats.outputColumns === stage.columns.length, 'Explanation column count must match stage columns.');
        });
        assert(result.explanation.summary.endsWith(result.result.length + ' row' + (result.result.length === 1 ? '.' : 's.')), 'Summary must use exact final count.');
      });
    }

    for (let index = 0; index < 20; index += 1) {
      test('Stress visualization tab and step synchronization ' + (index + 1), function () {
        const result = explain('SELECT name FROM students WHERE cgpa > 8 ORDER BY name LIMIT 4;');
        result.queryPlan = global.SqlFlow.queryplan.buildQueryPlan(result);
        visualizer.showExecutionResult(result);
        visualizer.setTab('explanation'); visualizer.nextStep(); visualizer.nextStep(); visualizer.previousStep();
        assert(visualizer.state.currentStep === 1 && document.querySelector('#explanationContainer .explanation-card.active').dataset.stageIndex === '1', 'Explanation must track rapid navigation.');
        visualizer.setTab('tree');
        const node = document.querySelector('#queryTreeContainer [data-stage-index="2"]'); node.click();
        assert(visualizer.state.activeTab === 'execution' && visualizer.state.currentStep === 2, 'Tree selection must synchronize execution.');
        visualizer.setTab('result');
        assert(document.getElementById('finalResultContainer').textContent.includes(result.result[0].name), 'Final Result must show current data.');
      });
    }

    for (let index = 0; index < 12; index += 1) {
      test('Stress rapid alternating execution state ' + (index + 1), function () {
        const first = explain(index % 2 ? 'SELECT * FROM students;' : 'SELECT * FROM courses;');
        const second = explain(index % 2 ? 'SELECT * FROM departments;' : 'SELECT * FROM enrollments LIMIT 2;');
        visualizer.showExecutionResult(first); visualizer.toggleAutoPlay(); visualizer.showExecutionResult(second);
        assert(visualizer.state.executionResult === second && visualizer.state.currentStep === 0 && visualizer.state.autoPlayTimer === null, 'Newest execution must replace autoplay state atomically.');
        visualizer.setTab('explanation');
        assert(document.getElementById('explanationContainer').textContent.includes(second.explanation.steps[0].whatHappened), 'Explanation must belong to newest query.');
      });
    }

    for (let index = 0; index < 12; index += 1) {
      test('Stress Presentation Mode repeated feature access ' + (index + 1), function () {
        const result = explain(index % 2 ? 'SELECT department, AVG(cgpa) FROM students GROUP BY department;' : 'SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id LIMIT 3;');
        result.queryPlan = global.SqlFlow.queryplan.buildQueryPlan(result);
        visualizer.showExecutionResult(result); global.SqlFlow.ui.setPresentationMode(true);
        ['execution', 'explanation', 'tree', 'result'].forEach(function (tab) { visualizer.setTab(tab); assert(visualizer.state.activeTab === tab, 'Presentation mode must retain ' + tab + '.'); });
        global.SqlFlow.ui.setPresentationMode(false);
        assert(!document.body.classList.contains('presentation-mode'), 'Presentation mode must exit cleanly.');
      });
    }

    for (let index = 0; index < 12; index += 1) {
      test('Stress custom table SELECT/GROUP/DISTINCT ' + (index + 1), function () {
        const name = 'stress_custom_' + index;
        createStressTable(name);
        try {
          const result = execute('SELECT category, COUNT(*), AVG(score) FROM ' + name + ' WHERE score >= ' + (index % 2 ? 20 : 10) + ' GROUP BY category ORDER BY category;');
          assert(result.result.length === 2 && result.result.every(function (row) { return row['COUNT(*)'] >= 1 && row['AVG(score)'] >= 10; }), 'Custom grouping must calculate exact valid groups.');
          const distinct = execute('SELECT DISTINCT score FROM ' + name + ';');
          assert(distinct.result.length === 3, 'Duplicate-heavy custom data must yield three unique scores.');
        } finally { cleanup(name); }
      });
    }

    for (let index = 0; index < 15; index += 1) {
      test('Stress DML state sequence ' + (index + 1), function () {
        const name = 'stress_dml_' + index;
        createStressTable(name);
        try {
          let result = executeStatement("INSERT INTO " + name + " (id, category, score) VALUES (5, 'C', 50);");
          assert(result.affectedRows === 1 && database.getTable(name).rows.length === 5, 'INSERT must add exact row.');
          result = executeStatement('UPDATE ' + name + ' SET score = 25 WHERE category = \'A\';');
          assert(result.affectedRows === 2 && database.getTable(name).rows.filter(function (row) { return row.score === 25; }).length === 2, 'UPDATE must change both category A rows.');
          result = executeStatement('DELETE FROM ' + name + ' WHERE score < 0;');
          assert(result.affectedRows === 0 && database.getTable(name).rows.length === 5, 'Zero-row DELETE must preserve state.');
          result = execute('SELECT SUM(score) FROM ' + name + ';');
          assert(result.result[0]['SUM(score)'] === 160, 'SELECT after DML must observe exact state.');
        } finally { cleanup(name); }
      });
    }

    for (let index = 0; index < 12; index += 1) {
      test('Stress transaction savepoint workflow ' + (index + 1), function () {
        const name = 'stress_tx_' + index;
        createStressTable(name);
        try {
          executeStatement('BEGIN;');
          executeStatement('UPDATE ' + name + ' SET score = 99 WHERE id = 1;');
          assert(executeStatement('SELECT score FROM ' + name + ' WHERE id = 1;').result[0].score === 99, 'Working SELECT must see UPDATE.');
          executeStatement('SAVEPOINT A;');
          executeStatement("INSERT INTO " + name + " VALUES (5, 'C', 50);");
          executeStatement('SAVEPOINT B;');
          executeStatement('DELETE FROM ' + name + ' WHERE id = 4;');
          executeStatement('ROLLBACK TO B;');
          assert(executeStatement('SELECT id FROM ' + name + ' ORDER BY id;').result.length === 5, 'ROLLBACK TO B must restore deleted row.');
          executeStatement('ROLLBACK TO A;');
          assert(executeStatement('SELECT id FROM ' + name + ' ORDER BY id;').result.length === 4, 'ROLLBACK TO A must remove later insert.');
          const commit = executeStatement('COMMIT;');
          commit.explanation = explanations.build(commit);
          assert(database.getTable(name).rows[0].score === 99 && !transactions.getState().active, 'COMMIT must persist retained update.');
          assert(commit.explanation.summary.includes('made permanent'), 'COMMIT explanation must match state.');
        } finally { cleanup(name); }
      });
    }

    for (let index = 0; index < 8; index += 1) {
      test('Stress transaction full rollback invariant ' + (index + 1), function () {
        const name = 'stress_rollback_' + index;
        createStressTable(name);
        const before = JSON.stringify(database.getTable(name).rows);
        try {
          executeStatement('BEGIN;'); executeStatement('UPDATE ' + name + ' SET score = 777 WHERE id >= 2;'); executeStatement('DELETE FROM ' + name + ' WHERE id = 1;'); executeStatement('ROLLBACK;');
          assert(JSON.stringify(database.getTable(name).rows) === before, 'ROLLBACK must restore byte-equivalent committed rows.');
        } finally { cleanup(name); }
      });
    }

    const integrationQueries = [
      'SELECT DISTINCT s.department, c.course_name, COUNT(*) FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id INNER JOIN courses c ON e.course_id = c.course_id WHERE s.cgpa >= 8 GROUP BY s.department, c.course_name HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 5;',
      'SELECT e.semester, c.department, AVG(c.credits), COUNT(*) FROM enrollments e JOIN courses c ON e.course_id = c.course_id WHERE c.credits >= 3 GROUP BY e.semester, c.department HAVING COUNT(*) >= 1 ORDER BY AVG(c.credits) DESC LIMIT 6;',
      'SELECT DISTINCT s.city, e.grade, COUNT(*) FROM students s LEFT JOIN enrollments e ON s.student_id = e.student_id WHERE s.year >= 2 GROUP BY s.city, e.grade HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 8;',
      'SELECT s.department, MIN(c.credits), MAX(c.credits), SUM(c.credits) FROM students s JOIN enrollments e ON s.student_id = e.student_id JOIN courses c ON e.course_id = c.course_id GROUP BY s.department ORDER BY SUM(c.credits) DESC LIMIT 5;'
    ];
    for (let repeat = 0; repeat < 3; repeat += 1) {
      integrationQueries.forEach(function (sql, index) {
        test('Stress cross-feature full representation ' + (repeat * integrationQueries.length + index + 1), function () {
          const result = explain(sql); result.queryPlan = global.SqlFlow.queryplan.buildQueryPlan(result);
          assert(result.result.length <= Number(sql.match(/LIMIT (\d+)/i)[1]), 'Integrated LIMIT invariant must hold.');
          assert(result.stages.filter(function (stage) { return stage.joinDetails; }).length >= 1, 'Integrated query must execute JOIN.');
          assert(result.explanation.steps.length === result.stages.length, 'Integrated explanation mapping must be complete.');
          assert(global.SqlFlow.queryplan.flattenTree(result.queryPlan.root).filter(function (node) { return node.stageIndex !== null; }).length === result.stages.length, 'Integrated tree mapping must be complete.');
          assert(result.queryPlan.algebra.includes('LIMIT'), 'Integrated algebra must include LIMIT.');
        });
      });
    }
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.stressTests = { register: register };
})(typeof window !== 'undefined' ? window : globalThis);
