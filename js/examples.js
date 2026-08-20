(function (global) {
  'use strict';

  const examples = [
    {
      label: 'Default Query',
      query: 'SELECT name, department, cgpa\nFROM students\nWHERE cgpa > 8\nORDER BY cgpa DESC;'
    },
    {
      label: 'Basic SELECT',
      query: 'SELECT *\nFROM students;'
    },
    {
      label: 'Filtering with AND',
      query: 'SELECT name, cgpa\nFROM students\nWHERE cgpa > 8 AND year >= 2;'
    },
    {
      label: 'Filtering with OR',
      query: "SELECT name, department\nFROM students\nWHERE department = 'Computer Science'\n   OR department = 'Design';"
    },
    {
      label: 'Grouped Boolean condition',
      query: "SELECT name, city, cgpa\nFROM students\nWHERE (cgpa > 9 AND year >= 3)\n   OR city = 'Mumbai';"
    },
    {
      label: 'Distinct departments',
      query: 'SELECT DISTINCT department\nFROM students;'
    },
    {
      label: 'Top five students',
      query: 'SELECT name, cgpa\nFROM students\nORDER BY cgpa DESC\nLIMIT 5;'
    },
    {
      label: 'Courses by credits',
      query: 'SELECT course_name, credits\nFROM courses\nWHERE credits >= 3\nORDER BY credits DESC;'
    },
    {
      label: 'Recent enrollments',
      query: "SELECT student_id, course_id, grade\nFROM enrollments\nWHERE semester = 'Spring 2026'\nLIMIT 5;"
    },
    {
      label: 'Department buildings',
      query: 'SELECT department_name, building\nFROM departments\nORDER BY department_name ASC;'
    },
    {
      label: 'Overall average CGPA',
      query: 'SELECT AVG(cgpa)\nFROM students;'
    },
    {
      label: 'Department averages',
      query: 'SELECT department, AVG(cgpa)\nFROM students\nGROUP BY department\nORDER BY AVG(cgpa) DESC;'
    },
    {
      label: 'Students by year',
      query: 'SELECT year, COUNT(*)\nFROM students\nGROUP BY year\nORDER BY year ASC;'
    },
    {
      label: 'Department averages with HAVING',
      query: 'SELECT department, AVG(cgpa)\nFROM students\nGROUP BY department\nHAVING AVG(cgpa) > 8.5\nORDER BY AVG(cgpa) DESC;'
    },
    {
      label: 'CGPA summary',
      query: 'SELECT MIN(cgpa), MAX(cgpa), AVG(cgpa)\nFROM students;'
    },
    {
      label: 'Courses by department',
      query: 'SELECT department, COUNT(*)\nFROM courses\nGROUP BY department;'
    },
    {
      label: 'Grade distribution',
      query: 'SELECT grade, COUNT(*)\nFROM enrollments\nGROUP BY grade\nORDER BY COUNT(*) DESC;'
    },
    {
      label: 'Basic INNER JOIN',
      query: 'SELECT s.name, e.grade\nFROM students s\nINNER JOIN enrollments e\nON s.student_id = e.student_id;'
    },
    {
      label: 'Three-table JOIN',
      query: 'SELECT s.name, c.course_name, e.grade\nFROM students s\nINNER JOIN enrollments e\nON s.student_id = e.student_id\nINNER JOIN courses c\nON e.course_id = c.course_id\nORDER BY s.name;'
    },
    {
      label: 'LEFT JOIN students',
      query: 'SELECT s.name, e.grade\nFROM students s\nLEFT JOIN enrollments e\nON s.student_id = e.student_id\nORDER BY s.name;'
    },
    {
      label: 'JOIN with WHERE',
      query: "SELECT s.name, c.course_name, e.grade\nFROM students s\nINNER JOIN enrollments e\nON s.student_id = e.student_id\nINNER JOIN courses c\nON e.course_id = c.course_id\nWHERE e.grade = 'A';"
    },
    {
      label: 'JOIN with GROUP BY',
      query: 'SELECT c.course_name, COUNT(*)\nFROM enrollments e\nINNER JOIN courses c\nON e.course_id = c.course_id\nGROUP BY c.course_name\nORDER BY COUNT(*) DESC;'
    },
    {
      label: 'INSERT employee',
      query: "INSERT INTO employees\n(employee_id, name, department, salary)\nVALUES (5, 'Neha', 'Engineering', 70000);"
    },
    {
      label: 'UPDATE employee',
      query: "UPDATE employees\nSET salary = 80000, department = 'Research'\nWHERE employee_id = 1;"
    },
    {
      label: 'DELETE employee',
      query: 'DELETE FROM employees\nWHERE employee_id = 4;'
    },
    {
      label: 'Begin transaction',
      query: 'BEGIN;'
    },
    {
      label: 'Create savepoint',
      query: 'SAVEPOINT salary_changed;'
    },
    {
      label: 'Rollback to savepoint',
      query: 'ROLLBACK TO salary_changed;'
    },
    {
      label: 'Rollback transaction',
      query: 'ROLLBACK;'
    },
    {
      label: 'Commit transaction',
      query: 'COMMIT;'
    }
  ];

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.examples = examples;
})(typeof window !== 'undefined' ? window : globalThis);
