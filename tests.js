(function (global) {
  'use strict';

  const tests = [];
  global.SqlFlow.database.clearCustomTables({ persist: false });
  function test(name, run) { tests.push({ name: name, run: run }); }
  function assert(condition, message) { if (!condition) { throw new Error(message); } }
  function execute(sql) { return global.SqlFlow.executor.executeQuery(sql, global.SqlFlow.database); }
  function assertThrows(sql, expectedText) {
    let error = null;
    try { execute(sql); } catch (caughtError) { error = caughtError; }
    assert(error, 'Expected query to fail: ' + sql);
    assert(error.message.toLowerCase().includes(expectedText.toLowerCase()), 'Expected error containing "' + expectedText + '", received "' + error.message + '".');
  }

  test('SELECT * FROM students', function () {
    const result = execute('SELECT * FROM students;');
    assert(result.result.length === 10, 'Expected all 10 rows.');
    assert(result.resultColumns.length === 6, 'Expected all 6 columns.');
  });
  test('Identifiers are case-insensitive', function () {
    const result = execute('SELECT NAME FROM STUDENTS;');
    assert(result.resultColumns[0] === 'name', 'Expected canonical name column.');
    assert(result.result[0].name === 'Alice Johnson', 'Expected student names.');
  });
  test('WHERE filters numeric values', function () {
    const result = execute('SELECT name FROM students WHERE cgpa > 8;');
    assert(result.result.length === 9, 'Expected 9 matching students.');
  });
  test('ORDER BY uses a non-projected column', function () {
    const result = execute('SELECT name FROM students ORDER BY cgpa DESC;');
    assert(result.result[0].name === 'Nia Patel', 'Expected highest CGPA first.');
    assert(result.resultColumns.length === 1 && result.resultColumns[0] === 'name', 'Expected cgpa to remain hidden.');
  });
  test('Clause words inside strings remain string content', function () {
    const result = execute("SELECT name, city FROM students WHERE city = 'Order By';");
    assert(result.result.length === 0, 'Expected a valid query with zero matches.');
  });
  test('ORDER and BY may be separated by a newline', function () {
    const result = execute('SELECT name FROM students ORDER\nBY cgpa DESC;');
    assert(result.result[0].name === 'Nia Patel', 'Expected descending CGPA order.');
  });
  test('Default query still works', function () {
    const result = execute('SELECT name, department, cgpa\nFROM students\nWHERE cgpa > 8\nORDER BY cgpa DESC;');
    assert(result.result.length === 9, 'Expected 9 rows.');
    assert(result.result[0].name === 'Nia Patel', 'Expected descending order.');
    assert(result.stages.map(function (stage) { return stage.label; }).join(',') === 'FROM,WHERE,SELECT,ORDER BY', 'Expected educational stage order.');
  });
  test('All Version 0.1 comparison operators execute', function () {
    ['=', '!=', '>', '<', '>=', '<='].forEach(function (operator) { execute('SELECT name FROM students WHERE year ' + operator + ' 2;'); });
  });
  test('Missing table fails', function () { assertThrows('SELECT * FROM nonexistent;', 'Table not found'); });
  test('Invalid SELECT column fails', function () { assertThrows('SELECT bogus FROM students;', 'Column not found in SELECT'); });
  test('Invalid WHERE column fails', function () { assertThrows('SELECT name FROM students WHERE bogus = 5;', 'Column not found in WHERE'); });
  test('Invalid ORDER BY column fails', function () { assertThrows('SELECT name FROM students ORDER BY bogus;', 'Column not found in ORDER BY'); });
  test('Unterminated string fails', function () { assertThrows("SELECT name FROM students WHERE city = 'unterminated;", 'unterminated quoted string'); });

  test('AND combines WHERE comparisons', function () {
    const result = execute('SELECT name FROM students WHERE cgpa > 8 AND year >= 2;');
    assert(result.result.length === 7, 'Expected 7 rows matching both comparisons.');
    assert(result.ast.where.type === 'LogicalExpression' && result.ast.where.operator === 'AND', 'Expected an AND expression node.');
  });
  test('OR combines WHERE comparisons', function () {
    const result = execute("SELECT name FROM students WHERE department = 'Computer Science' OR department = 'Design';");
    assert(result.result.length === 2, 'Expected the two matching departments.');
  });
  test('Parentheses group Boolean expressions', function () {
    const result = execute("SELECT name FROM students WHERE (cgpa > 9 AND year >= 3) OR city = 'Mumbai';");
    assert(result.result.length === 3, 'Expected three grouped-expression matches.');
    assert(result.ast.where.left.type === 'GroupedExpression', 'Expected grouping to be preserved in the AST.');
  });
  test('AND has precedence over OR', function () {
    const result = execute('SELECT name FROM students WHERE year = 1 OR year = 2 AND cgpa > 8.5;');
    assert(result.result.length === 3, 'Expected AND to bind more tightly than OR.');
    assert(result.ast.where.operator === 'OR' && result.ast.where.right.operator === 'AND', 'Expected OR with an AND right branch.');
  });
  test('DISTINCT removes duplicate one-column rows', function () {
    const result = execute('SELECT DISTINCT department FROM courses;');
    assert(result.result.length === 7, 'Expected duplicate Computer Science department to be removed.');
    assert(result.stages.some(function (stage) { return stage.label === 'DISTINCT'; }), 'Expected a DISTINCT stage.');
  });
  test('DISTINCT supports multiple columns', function () {
    const result = execute('SELECT DISTINCT semester, grade FROM enrollments;');
    const keys = new Set(result.result.map(function (row) { return row.semester + '|' + row.grade; }));
    assert(keys.size === result.result.length, 'Expected every projected pair to be unique.');
  });
  test('LIMIT keeps the requested number of rows', function () {
    const result = execute('SELECT * FROM students LIMIT 5;');
    assert(result.result.length === 5, 'Expected exactly 5 rows.');
    assert(result.stages[result.stages.length - 1].label === 'LIMIT', 'Expected LIMIT to be the final execution stage.');
  });
  test('ORDER BY runs before LIMIT', function () {
    const result = execute('SELECT name, cgpa FROM students WHERE cgpa > 8 ORDER BY cgpa DESC LIMIT 3;');
    assert(result.result.length === 3, 'Expected three rows.');
    assert(result.result[0].name === 'Nia Patel' && result.result[2].name === 'Mateo Silva', 'Expected the top three CGPAs.');
    assert(result.stages.map(function (stage) { return stage.label; }).join(',') === 'FROM,WHERE,SELECT,ORDER BY,LIMIT', 'Expected ORDER BY before LIMIT.');
  });
  test('Queries execute against courses', function () {
    const result = execute('SELECT course_name, credits FROM courses WHERE credits >= 3 ORDER BY credits DESC;');
    assert(result.result.length === 7 && result.result[0].credits === 4, 'Expected seven qualifying courses in descending credit order.');
  });
  test('Queries execute against enrollments', function () {
    const result = execute("SELECT student_id, grade FROM enrollments WHERE semester = 'Spring 2026';");
    assert(result.result.length === 7, 'Expected seven Spring 2026 enrollments.');
  });
  test('Queries execute against departments', function () {
    const result = execute('SELECT department_name, building FROM departments ORDER BY department_name ASC;');
    assert(result.result.length === 6 && result.result[0].department_name === 'Biology', 'Expected six alphabetized departments.');
  });
  test('Invalid LIMIT values fail clearly', function () {
    assertThrows('SELECT * FROM students LIMIT -1;', 'non-negative integer');
    assertThrows('SELECT * FROM students LIMIT 2.5;', 'non-negative integer');
    assertThrows('SELECT * FROM students LIMIT five;', 'non-negative integer');
  });
  test('Malformed Boolean expressions fail clearly', function () {
    assertThrows('SELECT * FROM students WHERE cgpa > 8 AND;', 'expected a column name');
    assertThrows('SELECT * FROM students WHERE OR year = 2;', 'expected a column name');
  });
  test('Mismatched parentheses fail clearly', function () {
    assertThrows('SELECT * FROM students WHERE (cgpa > 8 AND year >= 2;', 'closing parenthesis');
    assertThrows('SELECT * FROM students WHERE cgpa > 8);', 'parenthesis');
  });
  test('Incorrect DISTINCT placement fails', function () {
    assertThrows('SELECT department DISTINCT FROM students;', 'DISTINCT');
  });

  test('COUNT(*) counts every row', function () {
    const result = execute('SELECT COUNT(*) FROM students;');
    assert(result.result[0]['COUNT(*)'] === 10, 'Expected COUNT(*) to equal 10.');
    assert(result.resultColumns[0] === 'COUNT(*)', 'Expected a readable COUNT(*) header.');
  });
  test('COUNT(column) counts non-null column values', function () {
    const result = execute('SELECT COUNT(city) FROM students;');
    assert(result.result[0]['COUNT(city)'] === 10, 'Expected 10 non-null city values.');
  });
  test('SUM calculates a numeric total', function () {
    const result = execute('SELECT SUM(cgpa) FROM students;');
    assert(Math.abs(result.result[0]['SUM(cgpa)'] - 87.6) < 0.000001, 'Expected CGPA sum of 87.6.');
  });
  test('AVG calculates a numeric average', function () {
    const result = execute('SELECT AVG(cgpa) FROM students;');
    assert(Math.abs(result.result[0]['AVG(cgpa)'] - 8.76) < 0.000001, 'Expected average CGPA of 8.76.');
  });
  test('MIN supports numeric and string columns', function () {
    const result = execute('SELECT MIN(cgpa), MIN(name) FROM students;');
    assert(result.result[0]['MIN(cgpa)'] === 7.8, 'Expected minimum CGPA of 7.8.');
    assert(result.result[0]['MIN(name)'] === 'Alice Johnson', 'Expected alphabetically minimum name.');
  });
  test('MAX calculates a maximum', function () {
    const result = execute('SELECT MAX(cgpa) FROM students;');
    assert(result.result[0]['MAX(cgpa)'] === 9.6, 'Expected maximum CGPA of 9.6.');
  });
  test('GROUP BY one column builds groups and aggregate rows', function () {
    const result = execute('SELECT year, COUNT(*) FROM students GROUP BY year ORDER BY year ASC;');
    assert(result.result.length === 4, 'Expected four year groups.');
    assert(result.result[0].year === 1 && result.result[0]['COUNT(*)'] === 2, 'Expected two first-year students.');
    const groupStage = result.stages.find(function (stage) { return stage.label === 'GROUP BY'; });
    assert(groupStage && groupStage.columns.includes('grouped_rows'), 'Expected a readable grouped-row stage.');
  });
  test('GROUP BY multiple columns builds composite groups', function () {
    const result = execute('SELECT year, department, COUNT(*) FROM students GROUP BY year, department;');
    assert(result.result.length === 10, 'Expected ten unique year and department groups.');
    assert(result.ast.groupBy.columns.length === 2, 'Expected two structural GROUP BY columns.');
  });
  test('Aggregate query works without GROUP BY', function () {
    const result = execute('SELECT MIN(cgpa), MAX(cgpa), AVG(cgpa) FROM students;');
    assert(result.result.length === 1, 'Expected one implicit aggregate group.');
    assert(!result.stages.some(function (stage) { return stage.label === 'GROUP BY'; }), 'Expected no visible GROUP BY stage.');
    assert(result.stages.some(function (stage) { return stage.label === 'SELECT / AGGREGATE'; }), 'Expected an aggregate stage.');
  });
  test('HAVING filters using an aggregate expression', function () {
    const result = execute('SELECT department, AVG(cgpa) FROM students GROUP BY department HAVING AVG(cgpa) > 8.5;');
    assert(result.result.length === 7, 'Expected seven departments above 8.5.');
    assert(result.stages.some(function (stage) { return stage.label === 'HAVING'; }), 'Expected a HAVING stage.');
  });
  test('HAVING supports Boolean expressions and grouped columns', function () {
    const result = execute('SELECT year, COUNT(*) FROM students GROUP BY year HAVING COUNT(*) >= 3 OR year = 4 ORDER BY year ASC;');
    assert(result.result.length === 3, 'Expected year groups 2, 3, and 4.');
    assert(result.result.map(function (row) { return row.year; }).join(',') === '2,3,4', 'Expected HAVING Boolean result groups.');
  });
  test('ORDER BY supports selected aggregates', function () {
    const result = execute('SELECT grade, COUNT(*) FROM enrollments GROUP BY grade ORDER BY COUNT(*) DESC;');
    assert(result.result[0].grade === 'A' && result.result[0]['COUNT(*)'] === 5, 'Expected the most common grade first.');
  });
  test('GROUP BY, aggregate ORDER BY, and LIMIT compose correctly', function () {
    const result = execute('SELECT year, COUNT(*) FROM students GROUP BY year ORDER BY COUNT(*) DESC LIMIT 2;');
    assert(result.result.length === 2 && result.result[0]['COUNT(*)'] === 3, 'Expected the two largest year groups.');
    assert(result.stages.slice(-2).map(function (stage) { return stage.label; }).join(',') === 'ORDER BY,LIMIT', 'Expected ORDER BY before LIMIT.');
  });
  test('Aggregate query executes against courses', function () {
    const result = execute('SELECT department, COUNT(*) FROM courses GROUP BY department ORDER BY COUNT(*) DESC;');
    assert(result.result.length === 7 && result.result[0].department === 'Computer Science', 'Expected seven course departments with Computer Science first.');
  });
  test('Aggregate query executes against enrollments', function () {
    const result = execute('SELECT grade, COUNT(*) FROM enrollments GROUP BY grade ORDER BY COUNT(*) DESC;');
    assert(result.result.length === 5, 'Expected five distinct grade groups.');
  });
  test('Unknown aggregate columns fail clearly', function () {
    assertThrows('SELECT AVG(bogus) FROM students;', 'Column not found');
  });
  test('AVG and SUM reject non-numeric columns', function () {
    assertThrows('SELECT AVG(name) FROM students;', 'numeric column');
    assertThrows('SELECT SUM(city) FROM students;', 'numeric column');
  });
  test('Invalid grouped SELECT expressions fail clearly', function () {
    assertThrows('SELECT name, AVG(cgpa) FROM students GROUP BY department;', 'must appear in GROUP BY');
    assertThrows('SELECT name, AVG(cgpa) FROM students;', 'only aggregate expressions');
  });
  test('Malformed aggregate syntax fails clearly', function () {
    assertThrows('SELECT COUNT( FROM students;', 'column name inside COUNT');
    assertThrows('SELECT AVG(*) FROM students;', 'only COUNT accepts');
  });
  test('Malformed GROUP BY fails clearly', function () {
    assertThrows('SELECT department, COUNT(*) FROM students GROUP BY;', 'GROUP BY is missing');
  });
  test('Malformed or context-free HAVING fails clearly', function () {
    assertThrows('SELECT year, COUNT(*) FROM students GROUP BY year HAVING COUNT(*) >;', 'missing a number');
    assertThrows('SELECT name FROM students HAVING name = \'Alice Johnson\';', 'HAVING requires');
  });
  test('ORDER BY unknown aggregate expressions fail clearly', function () {
    assertThrows('SELECT department, AVG(cgpa) FROM students GROUP BY department ORDER BY MAX(cgpa);', 'must also appear in SELECT');
  });
  test('Full Version 0.3 aggregate pipeline integrates correctly', function () {
    const result = execute('SELECT department, AVG(cgpa) FROM students WHERE year >= 2 GROUP BY department HAVING AVG(cgpa) > 8 ORDER BY AVG(cgpa) DESC LIMIT 3;');
    assert(result.result.length === 3, 'Expected three limited groups.');
    assert(result.result.map(function (row) { return row.department; }).join(',') === 'Business Administration,Computer Science,Economics', 'Expected the top three department averages.');
    assert(result.stages.map(function (stage) { return stage.label; }).join(',') === 'FROM,WHERE,GROUP BY,SELECT / AGGREGATE,HAVING,ORDER BY,LIMIT', 'Expected the complete Version 0.3 pipeline.');
  });

  test('INNER JOIN combines matching students and enrollments', function () {
    const result = execute('SELECT students.name, enrollments.grade FROM students INNER JOIN enrollments ON students.student_id = enrollments.student_id;');
    assert(result.result.length === 15, 'Expected one result for every enrollment.');
    assert(result.stages[1].label === 'INNER JOIN enrollments', 'Expected an INNER JOIN stage.');
    assert(result.stages[1].joinDetails.matchedRows === 15, 'Expected 15 matched row combinations.');
  });
  test('LEFT JOIN retains unmatched left rows', function () {
    const result = execute('SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.student_id = e.student_id;');
    assert(result.result.length === 16, 'Expected 15 matches plus one unmatched student.');
    assert(result.stages[1].joinDetails.unmatchedRows === 1, 'Expected one unmatched left row.');
  });
  test('Multiple INNER JOINs combine three tables', function () {
    const result = execute('SELECT s.name, c.course_name, e.grade FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id INNER JOIN courses c ON e.course_id = c.course_id;');
    assert(result.result.length === 15, 'Expected all enrollments to resolve to courses.');
    assert(result.stages.filter(function (stage) { return stage.joinDetails; }).length === 2, 'Expected two independent JOIN stages.');
  });
  test('Bare aliases resolve case-insensitively', function () {
    const result = execute('SELECT S.NAME, E.GRADE FROM STUDENTS S JOIN ENROLLMENTS E ON S.STUDENT_ID = E.STUDENT_ID;');
    assert(result.resultColumns.join(',') === 'S.name,E.grade', 'Expected canonical qualified alias headers.');
    assert(result.result.length === 15, 'Expected alias-based join results.');
  });
  test('AS table aliases are supported', function () {
    const result = execute('SELECT s.name, e.grade FROM students AS s INNER JOIN enrollments AS e ON s.student_id = e.student_id;');
    assert(result.result.length === 15, 'Expected AS aliases to resolve.');
  });
  test('Qualified SELECT preserves readable headers', function () {
    const result = execute('SELECT s.name, e.student_id FROM students s JOIN enrollments e ON s.student_id = e.student_id LIMIT 1;');
    assert(result.resultColumns.join(',') === 's.name,e.student_id', 'Expected qualified visible headers.');
  });
  test('Qualified WHERE runs after JOIN', function () {
    const result = execute("SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id WHERE e.grade = 'A';");
    assert(result.result.length === 5, 'Expected five A-grade enrollments.');
    assert(result.stages.map(function (stage) { return stage.label; }).slice(0, 3).join(',') === 'FROM,INNER JOIN e,WHERE', 'Expected WHERE after JOIN.');
  });
  test('Qualified GROUP BY supports joined aggregates', function () {
    const result = execute('SELECT c.course_name, COUNT(*) FROM enrollments e JOIN courses c ON e.course_id = c.course_id GROUP BY c.course_name;');
    assert(result.result.length === 8, 'Expected eight course groups.');
  });
  test('Qualified ORDER BY sorts joined rows', function () {
    const result = execute('SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id ORDER BY s.name ASC;');
    assert(result.result[0]['s.name'] === 'Alice Johnson', 'Expected Alice first.');
  });
  test('Aggregates operate over joined rows', function () {
    const result = execute('SELECT s.department, COUNT(*) FROM students s JOIN enrollments e ON s.student_id = e.student_id GROUP BY s.department ORDER BY COUNT(*) DESC;');
    assert(result.result[0]['s.department'] === 'Computer Science' && result.result[0]['COUNT(*)'] === 3, 'Expected Computer Science to have three enrollment rows.');
  });
  test('SELECT * over JOIN avoids duplicate column overwrites', function () {
    const result = execute('SELECT * FROM students s JOIN enrollments e ON s.student_id = e.student_id LIMIT 1;');
    assert(result.resultColumns.includes('s.student_id') && result.resultColumns.includes('e.student_id'), 'Expected duplicate student_id columns to be qualified.');
    assert(result.result[0]['s.student_id'] === result.result[0]['e.student_id'], 'Expected both qualified IDs to remain available.');
  });
  test('Ambiguous unqualified joined columns fail clearly', function () {
    assertThrows('SELECT student_id FROM students s JOIN enrollments e ON s.student_id = e.student_id;', 'Ambiguous column');
  });
  test('Unknown aliases fail clearly', function () {
    assertThrows('SELECT x.name FROM students s;', 'Unknown table or alias');
  });
  test('Unknown joined tables fail clearly', function () {
    assertThrows('SELECT s.name FROM students s JOIN missing m ON s.student_id = m.student_id;', 'Table not found');
  });
  test('JOIN without ON fails clearly', function () {
    assertThrows('SELECT s.name FROM students s JOIN enrollments e WHERE s.cgpa > 8;', 'requires an ON condition');
  });
  test('Invalid JOIN columns fail clearly', function () {
    assertThrows('SELECT s.name FROM students s JOIN enrollments e ON s.bogus = e.student_id;', 'Column not found');
  });
  test('Unsupported JOIN operators fail clearly', function () {
    assertThrows('SELECT s.name FROM students s JOIN enrollments e ON s.student_id > e.student_id;', 'only the = operator');
  });
  test('Duplicate aliases fail clearly', function () {
    assertThrows('SELECT s.name FROM students s JOIN enrollments s ON s.student_id = s.student_id;', 'Duplicate table alias');
  });
  test('Invalid aliases fail clearly', function () {
    assertThrows('SELECT name FROM students AS 123;', 'alias after AS');
  });
  test('Unsupported JOIN types are not treated as aliases', function () {
    assertThrows('SELECT students.name FROM students RIGHT JOIN enrollments ON students.student_id = enrollments.student_id;', 'Unsupported SQL syntax');
  });
  test('Aliases cannot be referenced before declaration', function () {
    assertThrows('SELECT s.name FROM students s JOIN enrollments e ON c.course_id = e.course_id JOIN courses c ON e.course_id = c.course_id;', 'before declaration');
  });
  test('LEFT JOIN unmatched output uses NULL', function () {
    const result = execute('SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.student_id = e.student_id ORDER BY s.name;');
    const samuel = result.result.find(function (row) { return row['s.name'] === 'Samuel Green'; });
    assert(samuel && samuel['e.grade'] === null, 'Expected Samuel to have a NULL enrollment grade.');
  });
  test('JOIN, WHERE, and three-table projection compose', function () {
    const result = execute("SELECT s.name, c.course_name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id JOIN courses c ON e.course_id = c.course_id WHERE e.grade = 'A';");
    assert(result.result.length === 5 && result.result.every(function (row) { return row['e.grade'] === 'A'; }), 'Expected five joined A-grade rows.');
  });
  test('Full Version 0.4 JOIN pipeline integrates correctly', function () {
    const result = execute('SELECT s.department, COUNT(*) FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id WHERE s.cgpa > 8 GROUP BY s.department HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 3;');
    assert(result.result.length === 3, 'Expected three limited department groups.');
    assert(result.result[0]['s.department'] === 'Computer Science' && result.result[0]['COUNT(*)'] === 3, 'Expected Computer Science first.');
    assert(result.stages.map(function (stage) { return stage.label; }).join(',') === 'FROM,INNER JOIN e,WHERE,GROUP BY,SELECT / AGGREGATE,HAVING,ORDER BY,LIMIT', 'Expected the complete Version 0.4 pipeline.');
  });
  test('JOIN stage renders educational DOM details safely', function () {
    const result = execute('SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id;');
    global.SqlFlow.visualizer.showExecutionResult(result);
    global.SqlFlow.visualizer.nextStep();
    const joinPanel = document.querySelector('#executionTableContainer .join-visualization');
    assert(joinPanel, 'Expected a special JOIN visualization panel.');
    assert(joinPanel.textContent.includes('150 comparisons'), 'Expected the comparison count.');
    assert(joinPanel.textContent.includes('15 matched rows'), 'Expected the matched-row count.');
    assert(joinPanel.textContent.includes('s.student_id = e.student_id'), 'Expected the join condition.');
  });

  const employeeDefinition = {
    tableName: 'employees',
    columns: [
      { name: 'employee_id', type: 'INTEGER' },
      { name: 'name', type: 'TEXT' },
      { name: 'department', type: 'TEXT' },
      { name: 'salary', type: 'NUMBER' }
    ],
    rows: [
      { employee_id: 1, name: 'Asha', department: 'Engineering', salary: 72000 },
      { employee_id: 2, name: 'Rahul', department: 'Engineering', salary: 65000 },
      { employee_id: 3, name: 'Mira', department: 'Design', salary: 58000 },
      { employee_id: 4, name: 'Vikram', department: 'Design', salary: 62000 }
    ]
  };

  test('Custom tables can be created with typed schema metadata', function () {
    const table = global.SqlFlow.database.createCustomTable(employeeDefinition, { persist: false });
    assert(table.isCustom && table.rows.length === 4, 'Expected a four-row custom table.');
    assert(table.schema[0].type === 'INTEGER' && table.schema[3].type === 'NUMBER', 'Expected preserved schema types.');
  });
  test('Custom tables are queryable by the SQL engine', function () {
    const result = execute('SELECT name, salary FROM employees WHERE salary > 60000 ORDER BY salary DESC;');
    assert(result.result.length === 3 && result.result[0].name === 'Asha', 'Expected three qualifying employees ordered by salary.');
  });
  test('Custom-table lookup is case-insensitive', function () {
    const result = execute('SELECT NAME FROM EMPLOYEES WHERE EMPLOYEE_ID = 1;');
    assert(result.result[0].name === 'Asha', 'Expected case-insensitive custom lookup.');
  });
  test('Aggregates execute over custom numeric columns', function () {
    const result = execute('SELECT AVG(salary) FROM employees;');
    assert(result.result[0]['AVG(salary)'] === 64250, 'Expected the overall salary average.');
  });
  test('GROUP BY and HAVING execute over custom tables', function () {
    const result = execute('SELECT department, AVG(salary) FROM employees GROUP BY department HAVING AVG(salary) > 60000 ORDER BY AVG(salary) DESC;');
    assert(result.result.length === 1 && result.result[0].department === 'Engineering', 'Expected the grouped custom-table average above 60000.');
  });
  test('Two custom tables can be joined', function () {
    global.SqlFlow.database.createCustomTable({
      tableName: 'department_details',
      columns: [{ name: 'department', type: 'TEXT' }, { name: 'lead', type: 'TEXT' }],
      rows: [{ department: 'Engineering', lead: 'Neha' }, { department: 'Design', lead: 'Ishan' }]
    }, { persist: false });
    const result = execute('SELECT e.name, d.lead FROM employees e JOIN department_details d ON e.department = d.department ORDER BY e.name;');
    assert(result.result.length === 4 && result.result[0]['d.lead'] === 'Neha', 'Expected custom-to-custom join rows.');
  });
  test('Custom tables can join built-in tables', function () {
    const result = execute('SELECT e.name, d.building FROM employees e LEFT JOIN departments d ON e.department = d.department_name ORDER BY e.name;');
    const designEmployee = result.result.find(function (row) { return row['e.name'] === 'Mira'; });
    const engineeringEmployee = result.result.find(function (row) { return row['e.name'] === 'Asha'; });
    assert(designEmployee['d.building'] === 'Bauhaus Studio' && engineeringEmployee['d.building'] === null, 'Expected matched and unmatched built-in join values.');
  });
  test('Custom tables persist through the namespaced storage payload', function () {
    const memory = {};
    const fakeStorage = {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
      setItem: function (key, value) { memory[key] = value; }
    };
    global.SqlFlow.database.persistCustomTables(fakeStorage);
    assert(memory[global.SqlFlow.database.STORAGE_KEY], 'Expected namespaced persisted JSON.');
    global.SqlFlow.database.clearCustomTables({ persist: false });
    const loaded = global.SqlFlow.database.loadCustomTables(fakeStorage);
    assert(loaded.loaded === 2 && global.SqlFlow.database.getTable('employees').rows.length === 4, 'Expected custom tables to reload safely.');
  });
  test('Custom tables can be deleted', function () {
    global.SqlFlow.database.createCustomTable({ tableName: 'temporary_table', columns: [{ name: 'id', type: 'INTEGER' }], rows: [] }, { persist: false });
    global.SqlFlow.database.deleteCustomTable('temporary_table', { persist: false });
    assertThrows('SELECT * FROM temporary_table;', 'Table not found');
  });
  test('Built-in tables cannot be deleted', function () {
    let error = null;
    try { global.SqlFlow.database.deleteCustomTable('students', { persist: false }); } catch (caught) { error = caught; }
    assert(error && error.message.includes('cannot be deleted'), 'Expected built-in deletion protection.');
  });
  test('Duplicate custom-table names are rejected case-insensitively', function () {
    let error = null;
    try { global.SqlFlow.database.createCustomTable({ tableName: 'EMPLOYEES', columns: [{ name: 'id', type: 'INTEGER' }], rows: [] }, { persist: false }); } catch (caught) { error = caught; }
    assert(error && error.message.includes('already exists'), 'Expected duplicate table rejection.');
  });
  test('Duplicate custom columns are rejected case-insensitively', function () {
    let error = null;
    try { global.SqlFlow.database.createCustomTable({ tableName: 'bad_columns', columns: [{ name: 'code', type: 'TEXT' }, { name: 'CODE', type: 'TEXT' }], rows: [] }, { persist: false }); } catch (caught) { error = caught; }
    assert(error && error.message.includes('Duplicate column'), 'Expected duplicate column rejection.');
  });
  test('INTEGER columns reject decimal values', function () {
    let error = null;
    try { global.SqlFlow.database.createCustomTable({ tableName: 'bad_integer', columns: [{ name: 'id', type: 'INTEGER' }], rows: [{ id: 1.5 }] }, { persist: false }); } catch (caught) { error = caught; }
    assert(error && error.message.includes('integer value'), 'Expected integer validation error.');
  });
  test('NUMBER columns reject non-numeric values', function () {
    let error = null;
    try { global.SqlFlow.database.createCustomTable({ tableName: 'bad_number', columns: [{ name: 'amount', type: 'NUMBER' }], rows: [{ amount: 'many' }] }, { persist: false }); } catch (caught) { error = caught; }
    assert(error && error.message.includes('valid NUMBER'), 'Expected number validation error.');
  });
  test('Aggregate validation uses custom schema metadata for empty tables', function () {
    global.SqlFlow.database.createCustomTable({ tableName: 'empty_text', columns: [{ name: 'label', type: 'TEXT' }], rows: [] }, { persist: false });
    assertThrows('SELECT AVG(label) FROM empty_text;', 'numeric column');
  });
  test('Custom tables can be renamed and edited', function () {
    const current = global.SqlFlow.database.getTable('department_details');
    const updated = global.SqlFlow.database.updateCustomTable('department_details', {
      tableName: 'team_details', columns: current.schema, rows: current.rows
    }, { persist: false });
    assert(updated.name === 'team_details' && updated.rows.length === 2, 'Expected renamed custom table.');
    assertThrows('SELECT * FROM department_details;', 'Table not found');
  });
  test('Editing supports adding and removing columns', function () {
    const current = global.SqlFlow.database.getTable('team_details');
    const updated = global.SqlFlow.database.updateCustomTable('team_details', {
      tableName: 'team_details',
      columns: [{ name: 'department', type: 'TEXT' }, { name: 'floor', type: 'INTEGER' }],
      rows: current.rows.map(function (row, index) { return { department: row.department, floor: index + 1 }; })
    }, { persist: false });
    assert(updated.columns.join(',') === 'department,floor' && updated.rows[0].floor === 1, 'Expected updated schema and rows.');
  });
  test('CSV import handles quoted values and infers types', function () {
    const imported = global.SqlFlow.database.parseCsv('id,name,salary\r\n1,"Patel, Asha",72000.5\r\n2,Rahul,65000', 'csv_people');
    assert(imported.columns.map(function (column) { return column.type; }).join(',') === 'INTEGER,TEXT,NUMBER', 'Expected inferred CSV types.');
    assert(imported.rows[0].name === 'Patel, Asha' && imported.rows[0].salary === 72000.5, 'Expected parsed quoted and decimal values.');
  });
  test('CSV export escapes special text values', function () {
    global.SqlFlow.database.createCustomTable({
      tableName: 'export_people', columns: [{ name: 'name', type: 'TEXT' }, { name: 'note', type: 'TEXT' }],
      rows: [{ name: 'Asha', note: 'Design, Research' }, { name: 'Mira', note: 'Said "hello"' }]
    }, { persist: false });
    const csv = global.SqlFlow.database.exportTableCsv('export_people');
    assert(csv.includes('"Design, Research"') && csv.includes('"Said ""hello"""'), 'Expected valid CSV escaping.');
  });
  test('Malformed CSV is rejected safely', function () {
    let error = null;
    try { global.SqlFlow.database.parseCsv('id,name\n1,"unterminated', 'bad_csv'); } catch (caught) { error = caught; }
    assert(error && error.message.includes('Malformed CSV'), 'Expected malformed CSV error.');
  });
  test('Full Version 0.5 custom-table scenario integrates correctly', function () {
    const result = execute('SELECT department, AVG(salary) FROM employees GROUP BY department HAVING AVG(salary) > 60000 ORDER BY AVG(salary) DESC;');
    assert(result.result.length === 1, 'Expected only one department average strictly above 60000.');
    assert(result.result[0].department === 'Engineering' && result.result[0]['AVG(salary)'] === 68500, 'Expected Engineering average first.');
  });
  test('Malformed saved localStorage data is ignored safely', function () {
    const badStorage = { getItem: function () { return '{not json'; }, setItem: function () {} };
    const loaded = global.SqlFlow.database.loadCustomTables(badStorage);
    assert(loaded.loaded === 0 && loaded.error.includes('malformed'), 'Expected corrupted storage to be ignored.');
  });

  const transactionStorageData = {};
  const transactionStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(transactionStorageData, key) ? transactionStorageData[key] : null; },
    setItem: function (key, value) { transactionStorageData[key] = value; }
  };
  global.SqlFlow.database.setStorageForTests(transactionStorage);

  function executeStatement(sql, options) {
    const statement = global.SqlFlow.parser.parseStatement(sql);
    if (statement.type === 'SelectQuery') {
      return global.SqlFlow.executor.executeQuery(sql, global.SqlFlow.transactions.getDatabaseView());
    }
    return global.SqlFlow.transactions.execute(statement, options || {});
  }
  function resetEmployees() {
    global.SqlFlow.transactions.resetForTests();
    global.SqlFlow.database.updateCustomTable('employees', employeeDefinition, { persist: false });
    global.SqlFlow.database.persistCustomTables(transactionStorage);
  }

  test('INSERT supports explicit columns', function () {
    resetEmployees();
    const result = executeStatement("INSERT INTO employees (employee_id, name, department, salary) VALUES (5, 'Neha', 'Engineering', 70000);");
    assert(result.affectedRows === 1 && global.SqlFlow.database.getTable('employees').rows[4].name === 'Neha', 'Expected explicit-column INSERT.');
    assert(result.stages.map(function (stage) { return stage.label; }).join(',') === 'BEFORE,INSERT,AFTER', 'Expected mutation visualization stages.');
  });
  test('INSERT supports implicit full schema order', function () {
    resetEmployees();
    executeStatement("INSERT INTO employees VALUES (5, 'Neha', 'Engineering', 70000);");
    assert(global.SqlFlow.database.getTable('employees').rows[4].salary === 70000, 'Expected all-column INSERT.');
  });
  test('Invalid INSERT statements fail clearly', function () {
    resetEmployees();
    let countError = null;
    let duplicateError = null;
    try { executeStatement("INSERT INTO employees (employee_id, name) VALUES (5);"); } catch (error) { countError = error; }
    try { executeStatement("INSERT INTO employees (name, NAME) VALUES ('A', 'B');"); } catch (error) { duplicateError = error; }
    assert(countError && countError.message.includes('column count'), 'Expected INSERT count validation.');
    assert(duplicateError && duplicateError.message.includes('Duplicate INSERT column'), 'Expected duplicate INSERT column validation.');
  });
  test('INSERT enforces schema data types', function () {
    resetEmployees();
    let error = null;
    try { executeStatement("INSERT INTO employees VALUES (5.5, 'Neha', 'Engineering', 70000);"); } catch (caught) { error = caught; }
    assert(error && error.message.includes('integer value'), 'Expected INSERT integer validation.');
  });
  test('UPDATE modifies one column with WHERE', function () {
    resetEmployees();
    const result = executeStatement('UPDATE employees SET salary = 80000 WHERE employee_id = 1;');
    assert(result.affectedRows === 1 && global.SqlFlow.database.getTable('employees').rows[0].salary === 80000, 'Expected one-row UPDATE.');
  });
  test('UPDATE supports multiple assignments', function () {
    resetEmployees();
    executeStatement("UPDATE employees SET salary = 80000, department = 'Research' WHERE employee_id = 1;");
    const row = global.SqlFlow.database.getTable('employees').rows[0];
    assert(row.salary === 80000 && row.department === 'Research', 'Expected both UPDATE assignments.');
  });
  test('UPDATE reuses Boolean WHERE expressions', function () {
    resetEmployees();
    const result = executeStatement("UPDATE employees SET salary = 60000 WHERE department = 'Design' AND salary < 60000;");
    assert(result.affectedRows === 1 && global.SqlFlow.database.getTable('employees').rows[2].salary === 60000, 'Expected Boolean WHERE update.');
  });
  test('UPDATE validates columns and types', function () {
    resetEmployees();
    let columnError = null;
    let typeError = null;
    try { executeStatement('UPDATE employees SET bogus = 1;'); } catch (error) { columnError = error; }
    try { executeStatement("UPDATE employees SET salary = 'many';"); } catch (error) { typeError = error; }
    assert(columnError && columnError.message.includes('Column not found'), 'Expected unknown UPDATE column error.');
    assert(typeError && typeError.message.includes('valid NUMBER'), 'Expected UPDATE type error.');
  });
  test('DELETE with WHERE removes matching rows', function () {
    resetEmployees();
    const result = executeStatement('DELETE FROM employees WHERE employee_id = 4;');
    assert(result.affectedRows === 1 && global.SqlFlow.database.getTable('employees').rows.length === 3, 'Expected one deleted row.');
  });
  test('DELETE without WHERE requires confirmation', function () {
    resetEmployees();
    let error = null;
    try { executeStatement('DELETE FROM employees;'); } catch (caught) { error = caught; }
    assert(error && error.message.includes('requires confirmation'), 'Expected DELETE-all confirmation requirement.');
    const result = executeStatement('DELETE FROM employees;', { confirmedDeleteAll: true });
    assert(result.affectedRows === 4 && global.SqlFlow.database.getTable('employees').rows.length === 0, 'Expected confirmed DELETE-all.');
  });
  test('Built-in tables reject all data modifications', function () {
    let errors = 0;
    ["INSERT INTO students VALUES (1, 'A', 'B', 1, 1, 'C');", 'UPDATE students SET year = 2;', 'DELETE FROM students WHERE student_id = 1001;'].forEach(function (sql) {
      try { executeStatement(sql); } catch (error) { if (error.message.includes('Built-in tables are read-only')) { errors += 1; } }
    });
    assert(errors === 3, 'Expected INSERT, UPDATE, and DELETE built-in protection.');
  });
  test('BEGIN and START TRANSACTION activate isolated state', function () {
    resetEmployees();
    executeStatement('BEGIN;');
    assert(global.SqlFlow.transactions.getState().active, 'Expected active transaction.');
    executeStatement('ROLLBACK;');
    executeStatement('START TRANSACTION;');
    assert(global.SqlFlow.transactions.getState().active, 'Expected START TRANSACTION support.');
    executeStatement('ROLLBACK;');
  });
  test('Duplicate BEGIN is rejected', function () {
    resetEmployees(); executeStatement('BEGIN;');
    let error = null;
    try { executeStatement('BEGIN;'); } catch (caught) { error = caught; }
    assert(error && error.message.includes('already active'), 'Expected duplicate BEGIN error.');
    executeStatement('ROLLBACK;');
  });
  test('Transaction changes stay out of committed registry before COMMIT', function () {
    resetEmployees();
    const persistedBefore = transactionStorageData[global.SqlFlow.database.STORAGE_KEY];
    executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 80000 WHERE employee_id = 1;');
    assert(global.SqlFlow.database.getTable('employees').rows[0].salary === 72000, 'Expected committed data to remain unchanged.');
    const working = executeStatement('SELECT salary FROM employees WHERE employee_id = 1;');
    assert(working.result[0].salary === 80000, 'Expected read-your-writes from working state.');
    assert(transactionStorageData[global.SqlFlow.database.STORAGE_KEY] === persistedBefore, 'Expected no uncommitted persistence.');
    executeStatement('ROLLBACK;');
  });
  test('COMMIT persists working changes and cleans transaction state', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 80000 WHERE employee_id = 1;');
    executeStatement('SAVEPOINT changed;');
    const result = executeStatement('COMMIT;');
    const status = global.SqlFlow.transactions.getState();
    assert(global.SqlFlow.database.getTable('employees').rows[0].salary === 80000, 'Expected committed salary.');
    assert(!status.active && status.savepoints.length === 0 && status.pendingChanges.length === 0, 'Expected transaction cleanup.');
    assert(result.message.includes('now permanent') && transactionStorageData[global.SqlFlow.database.STORAGE_KEY].includes('80000'), 'Expected persisted COMMIT message and data.');
  });
  test('ROLLBACK restores committed data and cleans state', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('DELETE FROM employees WHERE employee_id = 4;');
    executeStatement('ROLLBACK;');
    const status = global.SqlFlow.transactions.getState();
    assert(global.SqlFlow.database.getTable('employees').rows.length === 4 && !status.active && status.savepoints.length === 0, 'Expected rollback restoration and cleanup.');
  });
  test('SAVEPOINT requires an active transaction', function () {
    resetEmployees();
    let error = null;
    try { executeStatement('SAVEPOINT first;'); } catch (caught) { error = caught; }
    assert(error && error.message.includes('requires an active transaction'), 'Expected SAVEPOINT state error.');
  });
  test('Multiple SAVEPOINTS are tracked case-insensitively', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('SAVEPOINT First;'); executeStatement('SAVEPOINT Second;');
    assert(global.SqlFlow.transactions.getState().savepoints.join(',') === 'First,Second', 'Expected two savepoints.');
    executeStatement('ROLLBACK TO first;');
    assert(global.SqlFlow.transactions.getState().savepoints.join(',') === 'First', 'Expected case-insensitive rollback and later-savepoint removal.');
    executeStatement('ROLLBACK;');
  });
  test('ROLLBACK TO restores the selected working snapshot', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 80000 WHERE employee_id = 1;');
    executeStatement('SAVEPOINT salary_changed;');
    executeStatement('DELETE FROM employees WHERE employee_id = 4;');
    executeStatement('ROLLBACK TO SAVEPOINT salary_changed;');
    const working = executeStatement('SELECT employee_id, salary FROM employees ORDER BY employee_id;');
    assert(working.result.length === 4 && working.result[0].salary === 80000, 'Expected savepoint snapshot restoration.');
    assert(global.SqlFlow.transactions.getState().timeline.some(function (event) { return event.type === 'DELETE' && event.status === 'ROLLED BACK'; }), 'Expected the undone DELETE timeline item to be marked rolled back.');
    executeStatement('ROLLBACK;');
  });
  test('Unknown SAVEPOINT fails clearly', function () {
    resetEmployees(); executeStatement('BEGIN;');
    let error = null;
    try { executeStatement('ROLLBACK TO missing;'); } catch (caught) { error = caught; }
    assert(error && error.message.includes('Unknown savepoint'), 'Expected unknown savepoint error.');
    executeStatement('ROLLBACK;');
  });
  test('COMMIT and ROLLBACK require active transactions', function () {
    resetEmployees();
    let commitError = null;
    let rollbackError = null;
    try { executeStatement('COMMIT;'); } catch (error) { commitError = error; }
    try { executeStatement('ROLLBACK;'); } catch (error) { rollbackError = error; }
    assert(commitError && commitError.message.includes('active transaction'), 'Expected COMMIT state error.');
    assert(rollbackError && rollbackError.message.includes('active transaction'), 'Expected ROLLBACK state error.');
  });
  test('Refresh-style transaction reset discards uncommitted working data', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 90000 WHERE employee_id = 1;');
    global.SqlFlow.transactions.resetForTests();
    assert(global.SqlFlow.database.getTable('employees').rows[0].salary === 72000, 'Expected refresh-equivalent reset to discard working changes.');
  });
  test('Complete Version 0.6 transaction scenario commits the correct snapshot', function () {
    resetEmployees();
    executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 80000 WHERE employee_id = 1;');
    executeStatement('SAVEPOINT salary_changed;');
    executeStatement('DELETE FROM employees WHERE employee_id = 4;');
    executeStatement('ROLLBACK TO salary_changed;');
    executeStatement('COMMIT;');
    const employees = global.SqlFlow.database.getTable('employees');
    const state = global.SqlFlow.transactions.getState();
    assert(employees.rows[0].salary === 80000 && employees.rows.some(function (row) { return row.employee_id === 4; }), 'Expected committed update and restored deleted row.');
    assert(!state.active && state.savepoints.length === 0, 'Expected completed transaction cleanup.');
    assert(transactionStorageData[global.SqlFlow.database.STORAGE_KEY].includes('80000'), 'Expected committed result in localStorage.');
  });
  test('Transaction panel renders status, savepoints, pending changes, and timeline safely', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 80000 WHERE employee_id = 1;');
    executeStatement('SAVEPOINT salary_changed;');
    global.SqlFlow.visualizer.renderTransactionState(global.SqlFlow.transactions.getState());
    assert(document.getElementById('transactionStatus').textContent === 'ACTIVE', 'Expected ACTIVE panel status.');
    assert(document.getElementById('transactionSavepoints').textContent === 'salary_changed', 'Expected visible savepoint.');
    assert(document.getElementById('transactionPending').textContent === '1', 'Expected one pending change.');
    assert(document.getElementById('transactionTimeline').textContent.includes('UPDATE'), 'Expected UPDATE timeline item.');
    const rollbackResult = executeStatement('ROLLBACK;');
    assert(rollbackResult.stages.map(function (stage) { return stage.label; }).join(',') === 'BEFORE,ROLLBACK,AFTER', 'Expected rollback transition visualization.');
  });
  test('Failed COMMIT persistence preserves committed data and active working state', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 81000 WHERE employee_id = 1;');
    global.SqlFlow.database.setStorageForTests({
      getItem: function () { return null; },
      setItem: function () { throw new Error('quota unavailable'); }
    });
    let error = null;
    try { executeStatement('COMMIT;'); } catch (caught) { error = caught; }
    assert(error && error.message.includes('could not persist'), 'Expected a persistence-safe COMMIT error.');
    assert(global.SqlFlow.database.getTable('employees').rows[0].salary === 72000, 'Expected committed data to be restored after failed persistence.');
    assert(global.SqlFlow.transactions.getState().active, 'Expected the working transaction to remain active for retry or rollback.');
    executeStatement('ROLLBACK;');
    global.SqlFlow.database.setStorageForTests(transactionStorage);
    global.SqlFlow.database.persistCustomTables(transactionStorage);
  });

  function buildPlan(sql) {
    const result = global.SqlFlow.executor.executeQuery(sql, global.SqlFlow.transactions.getDatabaseView());
    result.queryPlan = global.SqlFlow.queryplan.buildQueryPlan(result);
    return { result: result, plan: result.queryPlan };
  }
  function planTypes(plan) {
    return global.SqlFlow.queryplan.flattenTree(plan.root).map(function (node) { return node.type; });
  }

  test('Simple SELECT produces projection algebra and a FROM tree', function () {
    const built = buildPlan('SELECT * FROM students;');
    assert(built.plan.algebra.includes('π *') && built.plan.algebra.includes('FROM students'), 'Expected simple projection algebra.');
    assert(built.plan.root.type === 'PROJECT' && built.plan.root.children[0].type === 'FROM', 'Expected PROJECT over FROM tree.');
  });
  test('WHERE produces relational selection algebra', function () {
    const built = buildPlan('SELECT name FROM students WHERE cgpa > 8;');
    assert(built.plan.algebra.includes('σ cgpa > 8'), 'Expected sigma WHERE expression.');
    assert(planTypes(built.plan).includes('WHERE'), 'Expected WHERE tree node.');
  });
  test('Projection algebra lists selected columns', function () {
    const built = buildPlan('SELECT name, cgpa FROM students;');
    assert(built.plan.algebra.includes('π name, cgpa'), 'Expected selected projection columns.');
  });
  test('ORDER BY produces sorting algebra', function () {
    const built = buildPlan('SELECT name FROM students ORDER BY cgpa DESC;');
    assert(built.plan.algebra.startsWith('τ cgpa DESC'), 'Expected tau sorting operator.');
    assert(built.plan.root.type === 'ORDER BY', 'Expected ORDER BY tree root.');
  });
  test('DISTINCT produces a dedicated algebra operator and tree node', function () {
    const built = buildPlan('SELECT DISTINCT department FROM students;');
    assert(built.plan.algebra.startsWith('δ DISTINCT'), 'Expected distinct pseudo-operator.');
    assert(planTypes(built.plan).includes('DISTINCT'), 'Expected DISTINCT tree node.');
  });
  test('LIMIT produces a dedicated algebra operator and tree node', function () {
    const built = buildPlan('SELECT name FROM students LIMIT 3;');
    assert(built.plan.algebra.startsWith('λ LIMIT 3'), 'Expected limit pseudo-operator.');
    assert(built.plan.root.type === 'LIMIT', 'Expected LIMIT tree root.');
  });
  test('GROUP BY produces gamma algebra', function () {
    const built = buildPlan('SELECT department, AVG(cgpa) FROM students GROUP BY department;');
    assert(built.plan.algebra.includes('γ department; department, AVG(cgpa)'), 'Expected grouping algebra.');
    assert(planTypes(built.plan).includes('GROUP BY'), 'Expected GROUP BY tree node.');
  });
  test('Aggregate-only queries use grouping algebra', function () {
    const built = buildPlan('SELECT COUNT(*) FROM students;');
    assert(built.plan.algebra.includes('γ all rows; COUNT(*)'), 'Expected implicit all-row aggregate algebra.');
    assert(built.plan.root.type === 'PROJECT / AGGREGATE', 'Expected aggregate project node.');
  });
  test('HAVING produces post-group selection algebra', function () {
    const built = buildPlan('SELECT year, COUNT(*) FROM students GROUP BY year HAVING COUNT(*) >= 2;');
    assert(built.plan.algebra.includes('σ HAVING COUNT(*) >= 2'), 'Expected HAVING selection notation.');
    assert(built.plan.root.type === 'HAVING', 'Expected HAVING tree root.');
  });
  test('INNER JOIN produces join algebra and binary tree', function () {
    const built = buildPlan('SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id;');
    const join = global.SqlFlow.queryplan.flattenTree(built.plan.root).find(function (node) { return node.type === 'INNER JOIN'; });
    assert(built.plan.algebra.includes('⋈ s.student_id = e.student_id'), 'Expected inner-join algebra.');
    assert(join && join.children.length === 2, 'Expected binary JOIN node.');
  });
  test('LEFT JOIN produces left-join algebra', function () {
    const built = buildPlan('SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.student_id = e.student_id;');
    assert(built.plan.algebra.includes('⟕ s.student_id = e.student_id'), 'Expected left-join operator.');
    assert(planTypes(built.plan).includes('LEFT JOIN'), 'Expected LEFT JOIN tree node.');
  });
  test('Multiple JOINs form a nested binary query tree', function () {
    const built = buildPlan('SELECT s.name, c.course_name FROM students s JOIN enrollments e ON s.student_id = e.student_id JOIN courses c ON e.course_id = c.course_id;');
    const joins = global.SqlFlow.queryplan.flattenTree(built.plan.root).filter(function (node) { return node.type === 'INNER JOIN'; });
    assert(joins.length === 2 && joins[0].children[0].type === 'INNER JOIN', 'Expected the second JOIN above the first JOIN.');
  });
  test('Grouped query tree contains every meaningful stage', function () {
    const built = buildPlan('SELECT department, AVG(cgpa) FROM students WHERE year >= 2 GROUP BY department HAVING AVG(cgpa) > 8 ORDER BY AVG(cgpa) DESC LIMIT 3;');
    const types = planTypes(built.plan);
    ['LIMIT', 'ORDER BY', 'HAVING', 'PROJECT / AGGREGATE', 'GROUP BY', 'WHERE', 'FROM'].forEach(function (type) {
      assert(types.includes(type), 'Expected grouped tree node ' + type + '.');
    });
  });
  test('Tree nodes expose stage row counts and operation statistics', function () {
    const built = buildPlan('SELECT name FROM students WHERE cgpa > 8;');
    const whereNode = global.SqlFlow.queryplan.flattenTree(built.plan.root).find(function (node) { return node.type === 'WHERE'; });
    assert(whereNode.stats.inputRows === 10 && whereNode.stats.outputRows === 9, 'Expected WHERE row counts.');
    const joinBuilt = buildPlan('SELECT s.name FROM students s JOIN enrollments e ON s.student_id = e.student_id;');
    const joinNode = global.SqlFlow.queryplan.flattenTree(joinBuilt.plan.root).find(function (node) { return node.type === 'INNER JOIN'; });
    assert(joinNode.stats.comparisons === 150 && joinNode.stats.matches === 15, 'Expected JOIN statistics.');
  });
  test('Clicking a query-tree node selects its execution stage', function () {
    const built = buildPlan('SELECT name FROM students WHERE cgpa > 8;');
    global.SqlFlow.visualizer.showExecutionResult(built.result);
    global.SqlFlow.visualizer.setTab('tree');
    document.querySelector('#queryTreeContainer [data-stage-index="1"]').click();
    assert(global.SqlFlow.visualizer.state.activeTab === 'execution' && global.SqlFlow.visualizer.state.currentStep === 1, 'Expected tree click to open WHERE execution stage.');
  });
  test('Execution navigation synchronizes query-tree highlighting', function () {
    const built = buildPlan('SELECT name FROM students WHERE cgpa > 8 ORDER BY name;');
    global.SqlFlow.visualizer.showExecutionResult(built.result);
    global.SqlFlow.visualizer.nextStep();
    global.SqlFlow.visualizer.setTab('tree');
    const active = document.querySelector('#queryTreeContainer .query-tree-node.active');
    assert(active && active.dataset.stageIndex === '1', 'Expected WHERE tree node highlighted after Next.');
  });
  test('Aliases remain visible in algebra and tree clauses', function () {
    const built = buildPlan('SELECT s.name FROM students s WHERE s.cgpa > 8;');
    assert(built.plan.algebra.includes('FROM students s') && built.plan.algebra.includes('s.cgpa > 8'), 'Expected visible alias references.');
  });
  test('Custom-table SELECT produces a logical plan', function () {
    resetEmployees();
    const built = buildPlan('SELECT department, AVG(salary) FROM employees GROUP BY department;');
    assert(built.plan.algebra.includes('FROM employees') && planTypes(built.plan).includes('GROUP BY'), 'Expected custom-table query plan.');
  });
  test('Non-SELECT results disable algebra and tree tabs', function () {
    resetEmployees();
    const result = executeStatement('UPDATE employees SET salary = 72000 WHERE employee_id = 1;');
    global.SqlFlow.visualizer.showExecutionResult(result);
    assert(document.querySelector('.tab[data-tab="algebra"]').disabled, 'Expected disabled algebra tab.');
    assert(document.querySelector('.tab[data-tab="tree"]').disabled, 'Expected disabled tree tab.');
  });
  test('Relational algebra text can be copied through the clipboard adapter', function () {
    const built = buildPlan('SELECT name FROM students;');
    let copied = '';
    global.SqlFlow.queryplan.copyText(built.plan.algebra, { writeText: function (text) { copied = text; } });
    assert(copied === built.plan.algebra, 'Expected exact copied algebra text.');
  });
  test('Complex Version 0.7 plan integrates algebra, tree stages, and mappings', function () {
    const built = buildPlan('SELECT s.department, COUNT(*) FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id WHERE s.cgpa > 8 GROUP BY s.department HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 3;');
    const algebra = built.plan.algebra;
    ['FROM students s', '⋈', 'σ s.cgpa > 8', 'γ s.department', 'HAVING', 'τ COUNT(*) DESC', 'λ LIMIT 3'].forEach(function (concept) {
      assert(algebra.includes(concept), 'Expected algebra concept ' + concept + '.');
    });
    const mappedNodes = global.SqlFlow.queryplan.flattenTree(built.plan.root).filter(function (node) { return node.stageIndex !== null; });
    assert(mappedNodes.length === built.result.stages.length, 'Expected one mapped logical node per execution stage.');
    assert(mappedNodes.every(function (node) { return node.stageIndex >= 0 && node.stageIndex < built.result.stages.length; }), 'Expected valid stage mappings.');
  });

  test('Presentation mode toggles a readable layout and accessible label', function () {
    global.SqlFlow.ui.setPresentationMode(true);
    assert(document.body.classList.contains('presentation-mode'), 'Expected presentation layout class.');
    assert(document.getElementById('presentationModeBtn').getAttribute('aria-pressed') === 'true', 'Expected pressed state.');
    global.SqlFlow.ui.togglePresentationMode();
    assert(!document.body.classList.contains('presentation-mode'), 'Expected presentation mode to exit.');
  });
  test('Toast status renders user text safely and can be dismissed', function () {
    const value = '<img src=x onerror=alert(1)>';
    const toast = global.SqlFlow.ui.showToast(value, 'success', 0);
    assert(toast.textContent === value && !toast.querySelector('img'), 'Expected safe text-only toast rendering.');
    global.SqlFlow.ui.hideToast();
    assert(document.getElementById('toastContainer').classList.contains('hidden'), 'Expected dismissed toast.');
  });
  test('Keyboard shortcuts run and navigate without intercepting ordinary keys', function () {
    const calls = [];
    const remove = global.SqlFlow.ui.installKeyboardShortcuts({
      run: function () { calls.push('run'); }, next: function () { calls.push('next'); },
      previous: function () { calls.push('previous'); }, escape: function () { calls.push('escape'); return true; }
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    remove();
    assert(calls.join(',') === 'run,next,previous,escape', 'Expected only documented shortcuts.');
  });
  test('Escape exits presentation mode when no modal consumes it', function () {
    global.SqlFlow.ui.setPresentationMode(true);
    const remove = global.SqlFlow.ui.installKeyboardShortcuts({ run: function () {}, next: function () {}, previous: function () {}, escape: function () { return false; } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    remove();
    assert(!global.SqlFlow.ui.state.presentationMode, 'Expected Escape to exit presentation mode.');
  });
  test('Repeated demo-state resets are idempotent', function () {
    let closes = 0;
    let resets = 0;
    const actions = { closePanels: function () { closes += 1; }, reset: function () { resets += 1; } };
    global.SqlFlow.ui.setPresentationMode(true);
    global.SqlFlow.ui.performDemoReset(actions);
    global.SqlFlow.ui.performDemoReset(actions);
    assert(closes === 2 && resets === 2 && !global.SqlFlow.ui.state.presentationMode, 'Expected safe repeated resets.');
  });
  test('Reduced-motion fallback is present in the application stylesheet', function () {
    const rules = [];
    Array.from(document.styleSheets).forEach(function (sheet) {
      try { Array.from(sheet.cssRules || []).forEach(function (rule) { rules.push(rule.cssText); }); } catch (error) { /* inaccessible sheets are irrelevant */ }
    });
    assert(typeof global.matchMedia === 'function' && typeof global.matchMedia('(prefers-reduced-motion: reduce)').matches === 'boolean', 'Expected browser reduced-motion preference support.');
  });
  test('Rapid query switching replaces execution state cleanly', function () {
    const first = execute('SELECT * FROM students;');
    const second = execute('SELECT course_name FROM courses LIMIT 2;');
    global.SqlFlow.visualizer.showExecutionResult(first);
    global.SqlFlow.visualizer.nextStep();
    global.SqlFlow.visualizer.showExecutionResult(second);
    assert(global.SqlFlow.visualizer.state.executionResult === second && global.SqlFlow.visualizer.state.currentStep === 0, 'Expected only the newest query state.');
  });
  test('Running a query during autoplay stops the old timer', function () {
    global.SqlFlow.visualizer.showExecutionResult(execute('SELECT * FROM students;'));
    global.SqlFlow.visualizer.toggleAutoPlay();
    assert(global.SqlFlow.visualizer.state.autoPlayTimer !== null, 'Expected active autoplay.');
    global.SqlFlow.visualizer.showExecutionResult(execute('SELECT * FROM courses;'));
    assert(global.SqlFlow.visualizer.state.autoPlayTimer === null && document.getElementById('autoPlayBtn').textContent === 'Auto Play', 'Expected timer cleanup.');
  });
  test('Switching tabs during autoplay safely stops playback', function () {
    global.SqlFlow.visualizer.showExecutionResult(execute('SELECT name FROM students WHERE cgpa > 8;'));
    global.SqlFlow.visualizer.toggleAutoPlay();
    global.SqlFlow.visualizer.setTab('result');
    assert(global.SqlFlow.visualizer.state.autoPlayTimer === null && global.SqlFlow.visualizer.state.activeTab === 'result', 'Expected stable result tab.');
  });
  test('A malformed query after success cannot expose a stale result', function () {
    global.SqlFlow.visualizer.showExecutionResult(execute('SELECT name FROM students;'));
    let message = '';
    try { execute("SELECT name FROM students WHERE city = 'broken;"); } catch (error) { message = error.message; }
    global.SqlFlow.visualizer.showError(message);
    assert(global.SqlFlow.visualizer.state.executionResult === null && document.getElementById('finalResultContainer').textContent === '', 'Expected cleared stale result state.');
  });
  test('Custom-table operations remain joinable with built-in data', function () {
    if (global.SqlFlow.database.customTables.student_notes) { global.SqlFlow.database.deleteCustomTable('student_notes', { persist: false }); }
    global.SqlFlow.database.createCustomTable({
      tableName: 'student_notes',
      columns: [{ name: 'student_id', type: 'INTEGER' }, { name: 'note', type: 'TEXT' }],
      rows: [{ student_id: 1001, note: 'mentor' }, { student_id: 1004, note: 'project lead' }]
    }, { persist: false });
    const result = executeStatement('SELECT s.name, n.note FROM students s JOIN student_notes n ON s.student_id = n.student_id ORDER BY s.name;');
    assert(result.result.length === 2 && result.result.every(function (row) { return typeof row['s.name'] === 'string' && typeof row['n.note'] === 'string'; }), 'Expected a custom-to-built-in JOIN: ' + JSON.stringify(result.result));
  });
  test('Rollback is followed by aggregate SELECT over restored data', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('DELETE FROM employees WHERE department = \'Design\';');
    executeStatement('ROLLBACK;');
    const result = executeStatement('SELECT department, COUNT(*) FROM employees GROUP BY department ORDER BY COUNT(*) DESC;');
    assert(result.result.reduce(function (sum, row) { return sum + row['COUNT(*)']; }, 0) === 4, 'Expected aggregate over all restored rows.');
  });
  test('Version 1.0 large SELECT workflow integrates every representation', function () {
    const sql = 'SELECT s.department, c.course_name, COUNT(*) FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id INNER JOIN courses c ON e.course_id = c.course_id WHERE s.cgpa > 8 GROUP BY s.department, c.course_name HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 5;';
    const built = buildPlan(sql);
    assert(built.result.result.length === 5, 'Expected five limited grouped results.');
    const pipeline = built.result.stages.map(function (stage) { return stage.label; }).join(',');
    assert(pipeline === 'FROM,INNER JOIN e,INNER JOIN c,WHERE,GROUP BY,SELECT / AGGREGATE,HAVING,ORDER BY,LIMIT', 'Expected complete execution pipeline, received ' + pipeline + '.');
    assert(planTypes(built.plan).filter(function (type) { return type === 'INNER JOIN'; }).length === 2 && built.plan.algebra.includes('courses c'), 'Expected two joins in algebra and tree.');
    const mapped = global.SqlFlow.queryplan.flattenTree(built.plan.root).filter(function (node) { return node.stageIndex !== null; });
    assert(mapped.length === built.result.stages.length, 'Expected node-stage synchronization.');
  });
  test('Version 1.0 complete transaction workflow commits final visual state', function () {
    resetEmployees(); executeStatement('BEGIN;');
    executeStatement('UPDATE employees SET salary = 85000 WHERE employee_id = 1;');
    executeStatement('SAVEPOINT salary_update;');
    executeStatement('DELETE FROM employees WHERE employee_id = 4;');
    executeStatement('ROLLBACK TO salary_update;');
    executeStatement('COMMIT;');
    const table = global.SqlFlow.database.getTable('employees');
    const state = global.SqlFlow.transactions.getState();
    global.SqlFlow.visualizer.renderTransactionState(state);
    assert(table.rows[0].salary === 85000 && table.rows.some(function (row) { return row.employee_id === 4; }), 'Expected updated salary and restored row.');
    assert(!state.active && state.savepoints.length === 0 && state.timeline.some(function (event) { return event.status === 'COMMITTED'; }), 'Expected committed timeline and cleanup.');
    assert(document.getElementById('transactionStatus').textContent === 'INACTIVE', 'Expected final inactive visual state.');
  });

  function explainSelect(sql) {
    const result = execute(sql);
    result.explanation = global.SqlFlow.explanations.build(result);
    return result;
  }
  function explanationText(result) {
    return result.explanation.steps.map(function (step) { return [step.title, step.clause, step.whatHappened, step.whyItMatters].join(' '); }).join(' ') + ' ' + result.explanation.summary;
  }

  test('Explanation tab exists as the fifth visualization tab', function () {
    assert(document.querySelectorAll('.tab').length === 5 && document.querySelector('.tab[data-tab="explanation"]'), 'Expected fifth Explanation tab.');
  });
  test('Simple SELECT builds one explanation per actual stage', function () {
    const result = explainSelect('SELECT name FROM students;');
    assert(result.explanation.type === 'QueryExplanation' && result.explanation.steps.length === result.stages.length, 'Expected structured stage explanations.');
  });
  test('FROM explanation uses actual table dimensions', function () {
    const result = explainSelect('SELECT * FROM students;');
    assert(result.explanation.steps[0].whatHappened.includes('students table') && result.explanation.steps[0].whatHappened.includes('10 rows') && result.explanation.steps[0].whatHappened.includes('6 columns'), 'Expected measured FROM dimensions.');
  });
  test('FROM explanation includes a source alias', function () {
    const result = explainSelect('SELECT s.name FROM students s;');
    assert(result.explanation.steps[0].whatHappened.includes('as s'), 'Expected source alias.');
  });
  test('WHERE explanation includes Boolean text and row counts', function () {
    const result = explainSelect("SELECT name FROM students WHERE (cgpa > 8 AND year >= 2) OR city = 'Mumbai';");
    const step = result.explanation.steps.find(function (item) { return item.operation === 'WHERE'; });
    assert(step.clause.includes('(cgpa > 8 AND year >= 2) OR city = \'Mumbai\'') && step.stats.inputRows === 10 && step.stats.outputRows === result.result.length, 'Expected structured Boolean condition and actual counts.');
  });
  test('Projection explanation describes selected columns and shape change', function () {
    const result = explainSelect('SELECT name, cgpa FROM students;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'SELECT'; });
    assert(step.whatHappened.includes('name, cgpa') && step.stats.outputColumns === 2, 'Expected projected columns.');
  });
  test('SELECT star explanation says every column is kept', function () {
    const result = explainSelect('SELECT * FROM courses;');
    assert(explanationText(result).includes('SELECT * keeps every available column'), 'Expected wildcard explanation.');
  });
  test('ORDER BY explanation describes direction and practical meaning', function () {
    const result = explainSelect('SELECT name FROM students ORDER BY cgpa DESC;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'ORDER BY'; });
    assert(step.whatHappened.includes('highest to lowest') && step.clause.includes('cgpa DESC'), 'Expected descending sort explanation.');
  });
  test('DISTINCT explanation reports measured duplicate removal', function () {
    const result = explainSelect('SELECT DISTINCT department FROM courses;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'DISTINCT'; });
    assert(step.stats.rowsRemoved === 1 && step.whatHappened.includes('1 duplicate row'), 'Expected actual duplicate count.');
  });
  test('LIMIT explanation reports rows retained and excluded', function () {
    const result = explainSelect('SELECT * FROM students LIMIT 3;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'LIMIT'; });
    assert(step.stats.inputRows === 10 && step.stats.outputRows === 3 && step.whatHappened.includes('excludes 7'), 'Expected actual LIMIT counts.');
  });
  test('GROUP BY explanation reports groups and representative keys', function () {
    const result = explainSelect('SELECT year, COUNT(*) FROM students GROUP BY year;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'GROUP BY'; });
    assert(step.stats.groups === 4 && step.whatHappened.includes('10 rows into 4 groups') && step.whatHappened.includes('Example group keys'), 'Expected actual grouping metadata.');
  });
  test('Aggregate explanation describes function and grouping context', function () {
    const result = explainSelect('SELECT department, AVG(cgpa), COUNT(*) FROM students GROUP BY department;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'SELECT / AGGREGATE'; });
    assert(step.whatHappened.includes('calculates the mean value within each group') && step.whatHappened.includes('counts every row within each group'), 'Expected aggregate semantics.');
  });
  test('Non-grouped aggregate explanation identifies an implicit group', function () {
    const result = explainSelect('SELECT MAX(cgpa) FROM students;');
    assert(explanationText(result).includes('single implicit group formed by all rows'), 'Expected implicit aggregate group.');
  });
  test('HAVING explanation distinguishes group filtering from WHERE', function () {
    const result = explainSelect('SELECT year, COUNT(*) FROM students GROUP BY year HAVING COUNT(*) >= 2;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'HAVING'; });
    assert(step.whatHappened.includes('after aggregate values') && step.whyItMatters.includes('WHERE filters source rows'), 'Expected clear HAVING distinction.');
  });
  test('INNER JOIN explanation reports comparisons, matches, and sources', function () {
    const result = explainSelect('SELECT s.name, e.grade FROM students s JOIN enrollments e ON s.student_id = e.student_id;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'INNER JOIN'; });
    assert(step.stats.comparisons === 150 && step.stats.matchedRows === 15 && step.whatHappened.includes('s.student_id = e.student_id'), 'Expected actual INNER JOIN statistics.');
  });
  test('LEFT JOIN explanation describes unmatched rows and NULL behavior', function () {
    const result = explainSelect('SELECT s.name, e.grade FROM students s LEFT JOIN enrollments e ON s.student_id = e.student_id;');
    const step = result.explanation.steps.find(function (item) { return item.operation === 'LEFT JOIN'; });
    assert(step.stats.unmatchedLeftRows > 0 && step.whatHappened.includes('NULL') && step.whatHappened.includes('Every left row'), 'Expected unmatched LEFT JOIN explanation.');
  });
  test('Multiple JOINs produce separate ordered explanations', function () {
    const result = explainSelect('SELECT s.name, c.course_name FROM students s JOIN enrollments e ON s.student_id = e.student_id JOIN courses c ON e.course_id = c.course_id;');
    const joins = result.explanation.steps.filter(function (item) { return item.operation === 'INNER JOIN'; });
    assert(joins.length === 2 && joins[0].stageIndex < joins[1].stageIndex, 'Expected two ordered JOIN explanations.');
  });
  test('Final SELECT summary dynamically covers filtering, projection, sorting, and rows', function () {
    const result = explainSelect('SELECT name, cgpa FROM students WHERE cgpa > 8 ORDER BY cgpa DESC;');
    assert(result.explanation.summary.includes('keeps rows matching cgpa > 8') && result.explanation.summary.includes('projects name, cgpa') && result.explanation.summary.includes('returns 9 rows'), 'Expected complete dynamic summary.');
  });
  test('INSERT explanation reports target, columns, dimensions, and persistence', function () {
    resetEmployees();
    const result = executeStatement("INSERT INTO employees (employee_id, name, department, salary) VALUES (5, 'Neha', 'Engineering', 70000);");
    result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('inserts one row into employees') && explanationText(result).includes('4 to 5 rows') && explanationText(result).includes('persisted immediately'), 'Expected INSERT effects.');
  });
  test('UPDATE explanation reports assignments, predicate, and affected rows', function () {
    resetEmployees();
    const result = executeStatement('UPDATE employees SET salary = 85000 WHERE employee_id = 1;');
    result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('updates 1 row') && explanationText(result).includes('salary = 85000') && explanationText(result).includes('employee_id = 1'), 'Expected UPDATE details.');
  });
  test('DELETE explanation reports predicate and measured removal', function () {
    resetEmployees();
    const result = executeStatement("DELETE FROM employees WHERE department = 'Design';");
    result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('removes 2 rows') && explanationText(result).includes("department = 'Design'") && explanationText(result).includes('4 to 2 rows'), 'Expected DELETE details.');
  });
  test('BEGIN explanation describes isolated working state', function () {
    resetEmployees(); const result = executeStatement('BEGIN;'); result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('working copy') && explanationText(result).includes('not permanent until COMMIT'), 'Expected BEGIN semantics.'); executeStatement('ROLLBACK;');
  });
  test('SAVEPOINT explanation uses its actual name', function () {
    resetEmployees(); executeStatement('BEGIN;'); const result = executeStatement('SAVEPOINT salary_update;'); result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('salary_update') && explanationText(result).includes('1 savepoint'), 'Expected named savepoint.'); executeStatement('ROLLBACK;');
  });
  test('ROLLBACK TO explanation preserves active transaction context', function () {
    resetEmployees(); executeStatement('BEGIN;'); executeStatement('SAVEPOINT salary_update;'); const result = executeStatement('ROLLBACK TO salary_update;'); result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('restored to savepoint salary_update') && result.transactionState.active, 'Expected ROLLBACK TO semantics.'); executeStatement('ROLLBACK;');
  });
  test('ROLLBACK explanation describes discarded uncommitted changes', function () {
    resetEmployees(); executeStatement('BEGIN;'); executeStatement('UPDATE employees SET salary = 85000 WHERE employee_id = 1;'); const result = executeStatement('ROLLBACK;'); result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('uncommitted changes are discarded') && !result.transactionState.active, 'Expected ROLLBACK semantics.');
  });
  test('COMMIT explanation describes permanent changes and cleanup', function () {
    resetEmployees(); executeStatement('BEGIN;'); executeStatement('UPDATE employees SET salary = 85000 WHERE employee_id = 1;'); const result = executeStatement('COMMIT;'); result.explanation = global.SqlFlow.explanations.build(result);
    assert(explanationText(result).includes('made permanent') && !result.transactionState.active, 'Expected COMMIT semantics.');
  });
  test('Explanation active card synchronizes with step navigation', function () {
    const result = explainSelect('SELECT name FROM students WHERE cgpa > 8 ORDER BY name;');
    global.SqlFlow.visualizer.showExecutionResult(result); global.SqlFlow.visualizer.setTab('explanation'); global.SqlFlow.visualizer.nextStep();
    const active = document.querySelector('#explanationContainer .explanation-card.active');
    assert(active && active.dataset.stageIndex === '1' && global.SqlFlow.visualizer.state.activeTab === 'explanation', 'Expected active explanation synchronization.');
  });
  test('Clicking an explanation card opens its matching execution stage', function () {
    const result = explainSelect('SELECT name FROM students WHERE cgpa > 8;');
    global.SqlFlow.visualizer.showExecutionResult(result); global.SqlFlow.visualizer.setTab('explanation');
    document.querySelector('#explanationContainer [data-stage-index="1"]').click();
    assert(global.SqlFlow.visualizer.state.activeTab === 'execution' && global.SqlFlow.visualizer.state.currentStep === 1, 'Expected explanation-to-execution navigation.');
  });
  test('Query errors clear stale explanation content', function () {
    const result = explainSelect('SELECT name FROM students;'); global.SqlFlow.visualizer.showExecutionResult(result); global.SqlFlow.visualizer.setTab('explanation');
    global.SqlFlow.visualizer.showError('Friendly syntax error');
    assert(global.SqlFlow.visualizer.state.executionResult === null && document.getElementById('explanationContainer').textContent === '', 'Expected stale explanation removal.');
  });
  test('Presentation Mode retains a usable Explanation view', function () {
    const result = explainSelect('SELECT name FROM students;'); global.SqlFlow.visualizer.showExecutionResult(result); global.SqlFlow.visualizer.setTab('explanation'); global.SqlFlow.ui.setPresentationMode(true);
    assert(!document.getElementById('explanationContainer').classList.contains('hidden') && document.body.classList.contains('presentation-mode'), 'Expected visible explanation in presentation mode.'); global.SqlFlow.ui.setPresentationMode(false);
  });
  test('Complex Version 1.1 workflow explains every measured stage and summary', function () {
    const result = explainSelect('SELECT s.department, c.course_name, COUNT(*) FROM students s INNER JOIN enrollments e ON s.student_id = e.student_id INNER JOIN courses c ON e.course_id = c.course_id WHERE s.cgpa > 8 GROUP BY s.department, c.course_name HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 5;');
    const operations = result.explanation.steps.map(function (step) { return step.operation; });
    assert(operations.join(',') === 'FROM,INNER JOIN,INNER JOIN,WHERE,GROUP BY,SELECT / AGGREGATE,HAVING,ORDER BY,LIMIT', 'Expected every complex explanation section.');
    assert(result.explanation.summary.includes('2 joins') && result.explanation.summary.includes('returns 5 rows'), 'Expected meaningful complex summary.');
    assert(result.explanation.steps.every(function (step, index) { return step.stageIndex === index; }), 'Expected exact stage mapping.');
  });

  global.SqlFlow.stressTests.register({ test: test, assert: assert, execute: execute });

  const output = document.getElementById('testOutput');
  const summary = document.getElementById('summary');
  let passed = 0;
  const lines = [];
  tests.forEach(function (item) {
    try { item.run(); passed += 1; lines.push('PASS  ' + item.name); }
    catch (error) { lines.push('FAIL  ' + item.name + '\n      ' + error.message); }
  });
  output.textContent = lines.join('\n');
  summary.textContent = passed + ' of ' + tests.length + ' tests passed.';
  summary.className = passed === tests.length ? 'pass' : 'fail';
})(typeof window !== 'undefined' ? window : globalThis);
