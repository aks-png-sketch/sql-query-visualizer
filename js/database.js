(function (global) {
  'use strict';

  const STORAGE_KEY = 'sqlflow.customTables.v1';
  const SUPPORTED_TYPES = ['TEXT', 'NUMBER', 'INTEGER'];

  function schema(namesAndTypes) {
    return namesAndTypes.map(function (item) { return { name: item[0], type: item[1] }; });
  }

  const builtInTables = {
    students: {
      name: 'students',
      schema: schema([['student_id', 'INTEGER'], ['name', 'TEXT'], ['department', 'TEXT'], ['cgpa', 'NUMBER'], ['year', 'INTEGER'], ['city', 'TEXT']]),
      rows: [
        { student_id: 1001, name: 'Alice Johnson', department: 'Computer Science', cgpa: 9.4, year: 3, city: 'Boston' },
        { student_id: 1002, name: 'Daniel Kim', department: 'Electrical Engineering', cgpa: 8.9, year: 2, city: 'Seoul' },
        { student_id: 1003, name: 'Priya Nair', department: 'Biology', cgpa: 8.1, year: 1, city: 'Delhi' },
        { student_id: 1004, name: 'Mateo Silva', department: 'Economics', cgpa: 9.1, year: 4, city: 'São Paulo' },
        { student_id: 1005, name: 'Sara Ahmed', department: 'Psychology', cgpa: 7.8, year: 2, city: 'Cairo' },
        { student_id: 1006, name: 'Leo Martin', department: 'Mechanical Engineering', cgpa: 8.7, year: 3, city: 'Berlin' },
        { student_id: 1007, name: 'Nia Patel', department: 'Business Administration', cgpa: 9.6, year: 4, city: 'Mumbai' },
        { student_id: 1008, name: 'Omar Haddad', department: 'Civil Engineering', cgpa: 8.4, year: 2, city: 'Beirut' },
        { student_id: 1009, name: 'Emma Rossi', department: 'Design', cgpa: 9.0, year: 3, city: 'Milan' },
        { student_id: 1010, name: 'Samuel Green', department: 'Mathematics', cgpa: 8.6, year: 1, city: 'Toronto' }
      ]
    },
    courses: {
      name: 'courses',
      schema: schema([['course_id', 'INTEGER'], ['course_name', 'TEXT'], ['department', 'TEXT'], ['credits', 'INTEGER']]),
      rows: [
        { course_id: 201, course_name: 'Database Systems', department: 'Computer Science', credits: 4 },
        { course_id: 202, course_name: 'Algorithms', department: 'Computer Science', credits: 4 },
        { course_id: 203, course_name: 'Digital Circuits', department: 'Electrical Engineering', credits: 3 },
        { course_id: 204, course_name: 'Cell Biology', department: 'Biology', credits: 3 },
        { course_id: 205, course_name: 'Microeconomics', department: 'Economics', credits: 3 },
        { course_id: 206, course_name: 'Engineering Mechanics', department: 'Mechanical Engineering', credits: 4 },
        { course_id: 207, course_name: 'Visual Communication', department: 'Design', credits: 2 },
        { course_id: 208, course_name: 'Linear Algebra', department: 'Mathematics', credits: 3 }
      ]
    },
    enrollments: {
      name: 'enrollments',
      schema: schema([['enrollment_id', 'INTEGER'], ['student_id', 'INTEGER'], ['course_id', 'INTEGER'], ['semester', 'TEXT'], ['grade', 'TEXT']]),
      rows: [
        { enrollment_id: 3001, student_id: 1001, course_id: 201, semester: 'Fall 2025', grade: 'A' },
        { enrollment_id: 3002, student_id: 1001, course_id: 202, semester: 'Fall 2025', grade: 'A' },
        { enrollment_id: 3003, student_id: 1002, course_id: 203, semester: 'Fall 2025', grade: 'B+' },
        { enrollment_id: 3004, student_id: 1003, course_id: 204, semester: 'Spring 2026', grade: 'A-' },
        { enrollment_id: 3005, student_id: 1004, course_id: 205, semester: 'Fall 2025', grade: 'A' },
        { enrollment_id: 3006, student_id: 1005, course_id: 207, semester: 'Spring 2026', grade: 'B' },
        { enrollment_id: 3007, student_id: 1006, course_id: 206, semester: 'Fall 2025', grade: 'A-' },
        { enrollment_id: 3008, student_id: 1007, course_id: 201, semester: 'Fall 2025', grade: 'A+' },
        { enrollment_id: 3009, student_id: 1007, course_id: 205, semester: 'Spring 2026', grade: 'A' },
        { enrollment_id: 3010, student_id: 1008, course_id: 206, semester: 'Spring 2026', grade: 'B+' },
        { enrollment_id: 3011, student_id: 1009, course_id: 207, semester: 'Fall 2025', grade: 'A' },
        { enrollment_id: 3012, student_id: 1001, course_id: 208, semester: 'Fall 2025', grade: 'A-' },
        { enrollment_id: 3013, student_id: 1002, course_id: 208, semester: 'Spring 2026', grade: 'B+' },
        { enrollment_id: 3014, student_id: 1003, course_id: 201, semester: 'Spring 2026', grade: 'B' },
        { enrollment_id: 3015, student_id: 1009, course_id: 202, semester: 'Spring 2026', grade: 'A-' }
      ]
    },
    departments: {
      name: 'departments',
      schema: schema([['department_id', 'INTEGER'], ['department_name', 'TEXT'], ['building', 'TEXT']]),
      rows: [
        { department_id: 1, department_name: 'Computer Science', building: 'Turing Hall' },
        { department_id: 2, department_name: 'Electrical Engineering', building: 'Faraday Center' },
        { department_id: 3, department_name: 'Biology', building: 'Darwin Hall' },
        { department_id: 4, department_name: 'Economics', building: 'Marshall House' },
        { department_id: 5, department_name: 'Design', building: 'Bauhaus Studio' },
        { department_id: 6, department_name: 'Mathematics', building: 'Ramanujan Hall' }
      ]
    }
  };

  Object.keys(builtInTables).forEach(function (name) {
    builtInTables[name].columns = builtInTables[name].schema.map(function (column) { return column.name; });
    builtInTables[name].isCustom = false;
  });

  const customTables = {};
  const tables = {};
  Object.keys(builtInTables).forEach(function (name) { tables[name] = builtInTables[name]; });
  let storageOverride = null;
  let lastStorageError = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cloneRows(rows) { return clone(rows || []); }
  function normalizeIdentifier(identifier) { return String(identifier || '').trim().toLowerCase(); }
  function registryKey(tableName) {
    const normalized = normalizeIdentifier(tableName);
    return Object.keys(tables).find(function (name) { return normalizeIdentifier(name) === normalized; });
  }
  function getStorage() {
    if (storageOverride) { return storageOverride; }
    try { return global.localStorage || null; } catch (error) { lastStorageError = error.message; return null; }
  }

  function publicTable(table) {
    return {
      name: table.name,
      columns: table.columns.slice(),
      schema: clone(table.schema),
      rows: cloneRows(table.rows),
      isCustom: Boolean(table.isCustom)
    };
  }
  function resolveTable(tableName) {
    const requested = String(tableName || '').trim();
    const key = registryKey(requested);
    if (!key) { throw new Error('Table not found: "' + requested + '".'); }
    return publicTable(tables[key]);
  }

  function validateName(name, label) {
    const value = String(name || '').trim();
    if (!value) { throw new Error(label + ' is required.'); }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      throw new Error(label + ' must start with a letter or underscore and contain only letters, numbers, and underscores.');
    }
    return value;
  }
  function convertValue(value, type, columnName, rowIndex) {
    if (type === 'TEXT') { return value === null || value === undefined ? '' : String(value); }
    if (value === '' || value === null || value === undefined) { return null; }
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(number)) { throw new Error('Row ' + (rowIndex + 1) + ', column "' + columnName + '" requires a valid ' + type + ' value.'); }
    if (type === 'INTEGER' && !Number.isInteger(number)) { throw new Error('Row ' + (rowIndex + 1) + ', column "' + columnName + '" requires an integer value.'); }
    return number;
  }

  function validateTableDefinition(definition, originalName) {
    const tableName = validateName(definition && definition.tableName, 'Table name');
    const existingKey = registryKey(tableName);
    if (existingKey && normalizeIdentifier(existingKey) !== normalizeIdentifier(originalName)) {
      throw new Error('A table named "' + tableName + '" already exists.');
    }
    const inputColumns = definition && Array.isArray(definition.columns) ? definition.columns : [];
    if (!inputColumns.length) { throw new Error('At least one column is required.'); }
    const seen = new Set();
    const columns = inputColumns.map(function (column) {
      const name = validateName(column && column.name, 'Column name');
      const normalized = normalizeIdentifier(name);
      if (seen.has(normalized)) { throw new Error('Duplicate column name: "' + name + '".'); }
      seen.add(normalized);
      const type = String(column && column.type || '').toUpperCase();
      if (!SUPPORTED_TYPES.includes(type)) { throw new Error('Column "' + name + '" has unsupported data type "' + type + '".'); }
      return { name: name, type: type };
    });
    const inputRows = definition && Array.isArray(definition.rows) ? definition.rows : [];
    const rows = inputRows.map(function (inputRow, rowIndex) {
      const row = {};
      columns.forEach(function (column) {
        row[column.name] = convertValue(inputRow ? inputRow[column.name] : null, column.type, column.name, rowIndex);
      });
      return row;
    });
    return { name: tableName, tableName: tableName, columns: columns.map(function (column) { return column.name; }), schema: columns, rows: rows, isCustom: true };
  }

  function persistCustomTables(storage) {
    const target = storage || getStorage();
    if (!target) { return false; }
    try {
      const payload = Object.keys(customTables).map(function (name) {
        const table = customTables[name];
        return { tableName: table.name, columns: clone(table.schema), rows: cloneRows(table.rows) };
      });
      target.setItem(STORAGE_KEY, JSON.stringify(payload));
      lastStorageError = null;
      return true;
    } catch (error) {
      lastStorageError = 'Could not save custom tables: ' + error.message;
      return false;
    }
  }

  function registerCustomTable(table) {
    customTables[table.name] = table;
    tables[table.name] = table;
  }
  function createCustomTable(definition, options) {
    const table = validateTableDefinition(definition, null);
    registerCustomTable(table);
    if (!options || options.persist !== false) { persistCustomTables(options && options.storage); }
    return publicTable(table);
  }
  function updateCustomTable(originalName, definition, options) {
    const oldKey = Object.keys(customTables).find(function (name) { return normalizeIdentifier(name) === normalizeIdentifier(originalName); });
    if (!oldKey) { throw new Error('Custom table not found: "' + originalName + '".'); }
    const table = validateTableDefinition(definition, oldKey);
    delete customTables[oldKey];
    delete tables[oldKey];
    registerCustomTable(table);
    if (!options || options.persist !== false) { persistCustomTables(options && options.storage); }
    return publicTable(table);
  }
  function deleteCustomTable(tableName, options) {
    const builtInKey = Object.keys(builtInTables).find(function (name) { return normalizeIdentifier(name) === normalizeIdentifier(tableName); });
    if (builtInKey) { throw new Error('Built-in table "' + builtInKey + '" cannot be deleted.'); }
    const key = Object.keys(customTables).find(function (name) { return normalizeIdentifier(name) === normalizeIdentifier(tableName); });
    if (!key) { throw new Error('Custom table not found: "' + tableName + '".'); }
    delete customTables[key];
    delete tables[key];
    if (!options || options.persist !== false) { persistCustomTables(options && options.storage); }
    return true;
  }

  function clearCustomTables(options) {
    Object.keys(customTables).forEach(function (name) { delete customTables[name]; delete tables[name]; });
    if (!options || options.persist !== false) { persistCustomTables(options && options.storage); }
  }
  function replaceCustomTables(definitions, options) {
    const validated = (definitions || []).map(function (definition) {
      return validateTableDefinition(definition, definition.tableName);
    });
    Object.keys(customTables).forEach(function (name) { delete customTables[name]; delete tables[name]; });
    validated.forEach(registerCustomTable);
    if (!options || options.persist !== false) { persistCustomTables(options && options.storage); }
    return validated.map(publicTable);
  }
  function loadCustomTables(storage) {
    const target = storage || getStorage();
    if (!target) { return { loaded: 0, error: lastStorageError }; }
    let payload;
    try {
      const saved = target.getItem(STORAGE_KEY);
      if (!saved) { return { loaded: 0, error: null }; }
      payload = JSON.parse(saved);
      if (!Array.isArray(payload)) { throw new Error('saved data must be an array'); }
    } catch (error) {
      lastStorageError = 'Saved custom-table data is malformed and was ignored.';
      return { loaded: 0, error: lastStorageError };
    }
    let loaded = 0;
    const errors = [];
    payload.forEach(function (definition) {
      try { const table = validateTableDefinition(definition, null); registerCustomTable(table); loaded += 1; }
      catch (error) { errors.push(error.message); }
    });
    lastStorageError = errors.length ? 'Some saved custom tables were invalid and were ignored: ' + errors.join(' ') : null;
    return { loaded: loaded, error: lastStorageError };
  }

  function parseCsvRows(text) {
    const input = String(text || '');
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (quoted) {
        if (character === '"') {
          if (input[index + 1] === '"') { value += '"'; index += 1; }
          else { quoted = false; }
        } else { value += character; }
      } else if (character === '"') {
        if (value.length) { throw new Error('Malformed CSV: unexpected quote inside an unquoted value.'); }
        quoted = true;
      } else if (character === ',') {
        row.push(value); value = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && input[index + 1] === '\n') { index += 1; }
        row.push(value); value = '';
        if (row.some(function (cell) { return cell !== ''; })) { rows.push(row); }
        row = [];
      } else { value += character; }
    }
    if (quoted) { throw new Error('Malformed CSV: unterminated quoted value.'); }
    if (value.length || row.length) { row.push(value); rows.push(row); }
    return rows;
  }
  function inferType(values) {
    const populated = values.filter(function (value) { return String(value).trim() !== ''; });
    if (populated.length && populated.every(function (value) { return /^[-+]?\d+$/.test(String(value).trim()); })) { return 'INTEGER'; }
    if (populated.length && populated.every(function (value) { return Number.isFinite(Number(String(value).trim())); })) { return 'NUMBER'; }
    return 'TEXT';
  }
  function parseCsv(text, suggestedTableName) {
    const records = parseCsvRows(text);
    if (!records.length) { throw new Error('Malformed CSV: a header row is required.'); }
    const headers = records[0].map(function (header) { return validateName(header, 'CSV column name'); });
    const seen = new Set();
    headers.forEach(function (header) {
      const key = normalizeIdentifier(header);
      if (seen.has(key)) { throw new Error('Duplicate CSV column name: "' + header + '".'); }
      seen.add(key);
    });
    const dataRows = records.slice(1);
    dataRows.forEach(function (record, index) {
      if (record.length !== headers.length) { throw new Error('Malformed CSV: row ' + (index + 2) + ' has ' + record.length + ' values; expected ' + headers.length + '.'); }
    });
    const columns = headers.map(function (header, columnIndex) {
      return { name: header, type: inferType(dataRows.map(function (record) { return record[columnIndex]; })) };
    });
    const rawRows = dataRows.map(function (record) {
      const result = {};
      headers.forEach(function (header, index) { result[header] = record[index]; });
      return result;
    });
    const definition = validateTableDefinition({ tableName: suggestedTableName || 'imported_table', columns: columns, rows: rawRows }, null);
    return { tableName: definition.name, columns: definition.schema, rows: definition.rows };
  }
  function csvEscape(value) {
    if (value === null || value === undefined) { return ''; }
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function exportTableCsv(tableName) {
    const table = resolveTable(tableName);
    if (!table.isCustom) { throw new Error('Only custom tables can be exported.'); }
    const lines = [table.columns.map(csvEscape).join(',')];
    table.rows.forEach(function (row) { lines.push(table.columns.map(function (column) { return csvEscape(row[column]); }).join(',')); });
    return lines.join('\r\n');
  }

  const UniversityDB = { name: 'UniversityDB', tables: builtInTables };
  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.database = {
    STORAGE_KEY: STORAGE_KEY,
    SUPPORTED_TYPES: SUPPORTED_TYPES.slice(),
    UniversityDB: UniversityDB,
    builtInTables: builtInTables,
    customTables: customTables,
    tables: tables,
    getTable: resolveTable,
    resolveTable: resolveTable,
    normalizeIdentifier: normalizeIdentifier,
    cloneRows: cloneRows,
    validateTableDefinition: validateTableDefinition,
    createCustomTable: createCustomTable,
    updateCustomTable: updateCustomTable,
    deleteCustomTable: deleteCustomTable,
    clearCustomTables: clearCustomTables,
    replaceCustomTables: replaceCustomTables,
    persistCustomTables: persistCustomTables,
    loadCustomTables: loadCustomTables,
    parseCsv: parseCsv,
    exportTableCsv: exportTableCsv,
    convertValue: convertValue,
    setStorageForTests: function (storage) { storageOverride = storage; },
    getLastStorageError: function () { return lastStorageError; }
  };

  loadCustomTables();
})(typeof window !== 'undefined' ? window : globalThis);
