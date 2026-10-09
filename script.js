(function (global) {
  'use strict';

  const defaultQuery = 'SELECT name, department, cgpa\nFROM students\nWHERE cgpa > 8\nORDER BY cgpa DESC;';
  let selectedTableName = 'students';
  let editorState = null;

  function element(id) { return document.getElementById(id); }
  function appendText(parent, tag, className, value) {
    const child = document.createElement(tag);
    if (className) { child.className = className; }
    child.textContent = value;
    parent.appendChild(child);
    return child;
  }

  function populateExamples() {
    const select = element('exampleQueries');
    if (!select) { return; }
    select.replaceChildren();
    const categories = [
      { label: 'Basics', range: [0, 2] }, { label: 'Filtering', range: [2, 5] },
      { label: 'Aggregation', range: [5, 17] }, { label: 'JOINs', range: [17, 22] },
      { label: 'Data Modification', range: [22, 25] }, { label: 'Transactions', range: [25, 30] },
      { label: 'Verified Demos', range: [30, 35] }, { label: 'v1.4 Syntax Demos', range: [35, 40] }
    ];
    const groups = {};
    categories.forEach(function (category) {
      const group = document.createElement('optgroup');
      group.label = category.label;
      groups[category.label] = group;
      select.appendChild(group);
    });
    global.SqlFlow.examples.forEach(function (example, index) {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = example.label;
      const category = categories.find(function (item) { return index >= item.range[0] && index < item.range[1]; });
      (category ? groups[category.label] : select).appendChild(option);
    });
    const custom = document.createElement('option');
    custom.value = '-1';
    custom.textContent = 'Custom / lesson query';
    custom.disabled = true;
    select.appendChild(custom);
  }

  function syncExampleSelection() {
    const editor = element('sqlEditor');
    const select = element('exampleQueries');
    if (!editor || !select) { return; }
    const index = global.SqlFlow.examples.findIndex(function (example) { return editor.value === example.query; });
    select.value = String(index);
  }

  function showDatabaseMessage(message) {
    const container = element('databaseMessage');
    container.textContent = message || '';
    container.classList.toggle('hidden', !message);
    if (message) { global.SqlFlow.ui.showToast(message, /error|could not|invalid/i.test(message) ? 'error' : 'success'); }
  }

  function selectDatabaseTable(tableName) {
    const table = global.SqlFlow.transactions.getDatabaseView().resolveTable(tableName);
    selectedTableName = table.name;
    document.querySelectorAll('.table-button').forEach(function (button) {
      button.classList.toggle('active', global.SqlFlow.database.normalizeIdentifier(button.dataset.table) === global.SqlFlow.database.normalizeIdentifier(table.name));
    });
    global.SqlFlow.visualizer.renderDatabasePreview(table);
  }

  function downloadCustomTable(tableName) {
    try {
      const csv = global.SqlFlow.database.exportTableCsv(tableName);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = tableName + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) { showDatabaseMessage(error.message); }
  }

  function deleteTableWithConfirmation(tableName) {
    if (global.SqlFlow.transactions.getState().active) {
      showDatabaseMessage('Finish the active transaction before deleting a custom table.');
      return;
    }
    if (!global.confirm('Delete custom table "' + tableName + '"? This cannot be undone.')) { return; }
    try {
      global.SqlFlow.database.deleteCustomTable(tableName);
      const wasSelected = global.SqlFlow.database.normalizeIdentifier(selectedTableName) === global.SqlFlow.database.normalizeIdentifier(tableName);
      refreshDatabaseExplorer(wasSelected ? 'students' : selectedTableName);
      showDatabaseMessage('Deleted custom table "' + tableName + '".');
    } catch (error) { showDatabaseMessage(error.message); }
  }

  function refreshDatabaseExplorer(preferredTable) {
    const tableList = element('tableList');
    tableList.replaceChildren();
    Object.keys(global.SqlFlow.database.tables).forEach(function (tableName) {
      const table = global.SqlFlow.database.getTable(tableName);
      const item = document.createElement('div');
      item.className = 'table-list-item' + (table.isCustom ? ' custom' : '');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-button';
      button.dataset.table = table.name;
      button.textContent = table.name;
      button.addEventListener('click', function () { selectDatabaseTable(table.name); });
      item.appendChild(button);
      appendText(item, 'span', 'table-kind-badge', table.isCustom ? 'CUSTOM' : 'BUILT-IN');

      if (table.isCustom) {
        const actions = document.createElement('div');
        actions.className = 'table-item-actions';
        [['Edit', function () { openTableEditor(table.name); }], ['Download CSV', function () { downloadCustomTable(table.name); }], ['Delete', function () { deleteTableWithConfirmation(table.name); }]].forEach(function (action) {
          const actionButton = document.createElement('button');
          actionButton.type = 'button';
          actionButton.className = 'secondary';
          actionButton.textContent = action[0];
          actionButton.addEventListener('click', action[1]);
          actions.appendChild(actionButton);
        });
        item.appendChild(actions);
      }
      tableList.appendChild(item);
    });
    if (!Object.keys(global.SqlFlow.database.customTables).length) {
      appendText(tableList, 'p', 'custom-empty-hint', 'No custom tables yet. Create one or import CSV when you are ready.');
    }
    const target = preferredTable && global.SqlFlow.database.tables[preferredTable] ? preferredTable : 'students';
    selectDatabaseTable(target);
  }

  function showTableEditorError(message) {
    const errorBox = element('tableEditorError');
    errorBox.textContent = message || '';
    errorBox.classList.toggle('hidden', !message);
  }

  function collectEditorRows() {
    if (!editorState) { return; }
    const rows = [];
    element('customRowsEditor').querySelectorAll('tbody tr').forEach(function (rowElement) {
      const row = [];
      rowElement.querySelectorAll('input[data-column-index]').forEach(function (input) { row[Number(input.dataset.columnIndex)] = input.value; });
      rows.push(row);
    });
    if (rows.length || element('customRowsEditor').querySelector('tbody')) { editorState.rows = rows; }
  }

  function collectEditorSchema() {
    if (!editorState) { return; }
    const schemaRows = element('columnEditor').querySelectorAll('.column-definition');
    if (!schemaRows.length) { return; }
    editorState.columns = Array.from(schemaRows).map(function (row) {
      return { name: row.querySelector('.column-name-input').value, type: row.querySelector('.column-type-select').value };
    });
  }

  function renderRowsEditor() {
    const container = element('customRowsEditor');
    container.replaceChildren();
    if (!editorState.columns.length) {
      appendText(container, 'div', 'empty-editor-state', 'Add at least one column before adding rows.');
      return;
    }
    if (!editorState.rows.length) {
      appendText(container, 'div', 'empty-editor-state', 'No rows yet. Zero-row tables are allowed.');
      return;
    }
    const table = document.createElement('table');
    table.className = 'custom-row-grid';
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    editorState.columns.forEach(function (column, index) { appendText(header, 'th', '', column.name || 'Column ' + (index + 1)); });
    appendText(header, 'th', '', '');
    thead.appendChild(header);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    editorState.rows.forEach(function (values, rowIndex) {
      const row = document.createElement('tr');
      editorState.columns.forEach(function (column, columnIndex) {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = column.type === 'TEXT' ? 'text' : 'number';
        if (column.type === 'NUMBER') { input.step = 'any'; }
        if (column.type === 'INTEGER') { input.step = '1'; }
        input.dataset.columnIndex = String(columnIndex);
        input.value = values[columnIndex] === null || values[columnIndex] === undefined ? '' : String(values[columnIndex]);
        cell.appendChild(input);
        row.appendChild(cell);
      });
      const actions = document.createElement('td');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () { collectEditorRows(); editorState.rows.splice(rowIndex, 1); renderRowsEditor(); });
      actions.appendChild(remove);
      row.appendChild(actions);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderColumnEditor() {
    const container = element('columnEditor');
    container.replaceChildren();
    editorState.columns.forEach(function (column, index) {
      const row = document.createElement('div');
      row.className = 'column-definition';
      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'column-name-input';
      name.placeholder = 'column_name';
      name.value = column.name;
      const type = document.createElement('select');
      type.className = 'column-type-select';
      global.SqlFlow.database.SUPPORTED_TYPES.forEach(function (typeName) {
        const option = document.createElement('option');
        option.value = typeName;
        option.textContent = typeName;
        option.selected = typeName === column.type;
        type.appendChild(option);
      });
      name.addEventListener('change', function () { collectEditorRows(); collectEditorSchema(); renderRowsEditor(); });
      type.addEventListener('change', function () { collectEditorRows(); collectEditorSchema(); renderRowsEditor(); });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = 'Remove';
      remove.addEventListener('click', function () {
        collectEditorRows(); collectEditorSchema();
        editorState.columns.splice(index, 1);
        editorState.rows.forEach(function (values) { values.splice(index, 1); });
        renderColumnEditor(); renderRowsEditor();
      });
      row.appendChild(name); row.appendChild(type); row.appendChild(remove);
      container.appendChild(row);
    });
  }

  function openTableEditor(tableName) {
    showTableEditorError('');
    if (tableName) {
      const table = global.SqlFlow.database.getTable(tableName);
      if (!table.isCustom) { showDatabaseMessage('Built-in tables cannot be edited.'); return; }
      editorState = {
        originalName: table.name,
        columns: table.schema.map(function (column) { return { name: column.name, type: column.type }; }),
        rows: table.rows.map(function (row) { return table.schema.map(function (column) { return row[column.name]; }); })
      };
      element('tableEditorTitle').textContent = 'Edit ' + table.name;
      element('customTableName').value = table.name;
    } else {
      editorState = { originalName: null, columns: [{ name: '', type: 'TEXT' }], rows: [] };
      element('tableEditorTitle').textContent = 'Create Table';
      element('customTableName').value = '';
    }
    renderColumnEditor();
    renderRowsEditor();
    element('tableEditorModal').classList.remove('hidden');
    element('customTableName').focus();
  }

  function closeTableEditor() {
    element('tableEditorModal').classList.add('hidden');
    editorState = null;
    element('csvFileInput').value = '';
  }

  function definitionFromEditor() {
    collectEditorRows(); collectEditorSchema();
    const rows = editorState.rows.map(function (values) {
      const row = {};
      editorState.columns.forEach(function (column, index) { row[column.name] = values[index]; });
      return row;
    });
    return { tableName: element('customTableName').value, columns: editorState.columns, rows: rows };
  }

  function saveTableEditor() {
    try {
      if (global.SqlFlow.transactions.getState().active) { throw new Error('Finish the active transaction before creating or editing table schemas.'); }
      const definition = definitionFromEditor();
      const table = editorState.originalName
        ? global.SqlFlow.database.updateCustomTable(editorState.originalName, definition)
        : global.SqlFlow.database.createCustomTable(definition);
      closeTableEditor();
      refreshDatabaseExplorer(table.name);
      showDatabaseMessage('Saved custom table "' + table.name + '".');
    } catch (error) { showTableEditorError(error.message); }
  }

  function uniqueImportedName(fileName) {
    let base = String(fileName || 'imported_table').replace(/\.csv$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z_]/.test(base)) { base = 'table_' + base; }
    if (!base) { base = 'imported_table'; }
    let candidate = base;
    let suffix = 2;
    while (Object.keys(global.SqlFlow.database.tables).some(function (name) { return global.SqlFlow.database.normalizeIdentifier(name) === global.SqlFlow.database.normalizeIdentifier(candidate); })) {
      candidate = base + '_' + suffix; suffix += 1;
    }
    return candidate;
  }

  function importCsvFile(file) {
    if (!file) { return; }
    file.text().then(function (text) {
      const imported = global.SqlFlow.database.parseCsv(text, uniqueImportedName(file.name));
      editorState.originalName = null;
      editorState.columns = imported.columns;
      editorState.rows = imported.rows.map(function (row) { return imported.columns.map(function (column) { return row[column.name]; }); });
      element('customTableName').value = imported.tableName;
      element('tableEditorTitle').textContent = 'Import CSV Table';
      renderColumnEditor(); renderRowsEditor(); showTableEditorError('');
      global.SqlFlow.ui.showToast('CSV imported. Review the inferred schema, then save the table.', 'success');
    }).catch(function (error) { showTableEditorError(error.message || 'Could not read the CSV file.'); });
  }

  function showFriendlyError(message) {
    global.SqlFlow.visualizer.showError(message);
    global.SqlFlow.academic.setResult(null);
    const helpButton = document.createElement('button'); helpButton.type='button'; helpButton.textContent='Help With This Error'; helpButton.addEventListener('click', function () { global.SqlFlow.help.errorHelp(message); }); element('executionTableContainer').appendChild(helpButton);
    global.SqlFlow.ui.showToast(message, 'error', 4500);
  }
  function runCurrentQuery() {
    const editor = element('sqlEditor');
    if (!editor) { return; }
    const exactInput = editor.value;
    syncExampleSelection();
    const queryText = exactInput.trim();
    global.SqlFlow.visualizer.resetVisualization();
    if (!queryText) { showFriendlyError('Please enter a valid SQL query before running it.'); return; }
    try {
      const statement = global.SqlFlow.parser.parseStatement(queryText);
      let result;
      if (statement.type === 'SelectQuery') {
        result = global.SqlFlow.executor.executeQuery(queryText, global.SqlFlow.transactions.getDatabaseView());
        result.queryPlan = global.SqlFlow.queryplan.buildQueryPlan(result);
      } else {
        let confirmedDeleteAll = false;
        if (statement.type === 'DeleteStatement' && statement.requiresConfirmation) {
          confirmedDeleteAll = global.confirm('This DELETE has no WHERE clause and will remove every row from the custom table. Continue?');
          if (!confirmedDeleteAll) { throw new Error('DELETE without WHERE was cancelled. No rows were changed.'); }
        }
        result = global.SqlFlow.transactions.execute(statement, { confirmedDeleteAll: confirmedDeleteAll });
        refreshDatabaseExplorer(selectedTableName);
      }
      result.explanation = global.SqlFlow.explanations.build(result);
      result.inputSql = exactInput;
      const selectedIndex = Number(element('exampleQueries').value);
      result.selectedExample = global.SqlFlow.selectedExampleLabel(exactInput, selectedIndex);
      global.SqlFlow.academic.setResult(result, { sql: exactInput, selectedExample: result.selectedExample });
      global.SqlFlow.visualizer.showExecutionResult(result);
      global.SqlFlow.visualizer.renderTransactionState(global.SqlFlow.transactions.getState());
      const status = global.SqlFlow.transactions.getState();
      const statusSuffix = status.active ? ' Transaction active.' : '';
      global.SqlFlow.ui.showToast('Statement executed successfully · ' + result.result.length + ' rows · ' + result.stages.length + ' stages.' + statusSuffix, 'success');
    } catch (error) { showFriendlyError(error.message || 'An unexpected SQL error occurred. Please check the query and try again.'); }
  }
  function resetEditor() { element('sqlEditor').value = defaultQuery; syncExampleSelection(); runCurrentQuery(); }

  function resetDemo() {
    if (global.SqlFlow.help) { global.SqlFlow.help.stop(false); }
    const transactionState = global.SqlFlow.transactions.getState();
    if (transactionState.active) {
      if (!global.confirm('Reset Demo will roll back the active transaction. Continue?')) { return false; }
      global.SqlFlow.transactions.rollback();
    }
    global.SqlFlow.ui.performDemoReset({
      closePanels: function () { closeTableEditor(); global.SqlFlow.academic.close(); global.SqlFlow.academic.closeReport(); },
      reset: function () {
        element('exampleQueries').value = '0';
        element('sqlEditor').value = defaultQuery;
        runCurrentQuery();
      }
    });
    global.SqlFlow.ui.showToast('Demo reset. Custom tables were preserved.', 'success');
    return true;
  }

  function clearCustomData() {
    if (global.SqlFlow.transactions.getState().active) {
      showDatabaseMessage('Finish the active transaction before clearing custom data.');
      return false;
    }
    if (!Object.keys(global.SqlFlow.database.customTables).length) {
      showDatabaseMessage('No custom tables to clear.');
      return false;
    }
    if (!global.confirm('Delete all custom tables? Built-in tables will be preserved.')) { return false; }
    global.SqlFlow.database.clearCustomTables();
    refreshDatabaseExplorer('students');
    showDatabaseMessage('All custom tables were cleared.');
    return true;
  }

  function closeTransientPanel() {
    if (global.SqlFlow.help && global.SqlFlow.help.isTourActive()) { global.SqlFlow.help.stop(false); return true; }
    if (!element('tableEditorModal').classList.contains('hidden')) { closeTableEditor(); return true; }
    if (!element('reportModal').classList.contains('hidden')) { global.SqlFlow.academic.closeReport(); return true; }
    if (!element('academicModal').classList.contains('hidden')) { global.SqlFlow.academic.close(); return true; }
    return false;
  }

  function showHelp(button) {
    document.querySelectorAll('.help-popover').forEach(function (popover) { popover.remove(); });
    const popover = document.createElement('div');
    popover.className = 'help-popover';
    popover.setAttribute('role', 'tooltip');
    popover.textContent = button.dataset.help;
    document.body.appendChild(popover);
    const bounds = button.getBoundingClientRect();
    popover.style.left = Math.min(bounds.left, global.innerWidth - 300) + 'px';
    popover.style.top = (bounds.bottom + 6) + 'px';
  }

  function attachEvents() {
    element('runQueryBtn').addEventListener('click', runCurrentQuery);
    element('resetQueryBtn').addEventListener('click', resetEditor);
    element('prevStepBtn').addEventListener('click', global.SqlFlow.visualizer.previousStep);
    element('nextStepBtn').addEventListener('click', global.SqlFlow.visualizer.nextStep);
    element('autoPlayBtn').addEventListener('click', global.SqlFlow.visualizer.toggleAutoPlay);
    document.querySelectorAll('.tab').forEach(function (tab) { tab.addEventListener('click', function () { global.SqlFlow.visualizer.setTab(tab.dataset.tab); }); });
    element('exampleQueries').addEventListener('change', function (event) {
      const example = global.SqlFlow.examples[Number(event.target.value)];
      if (example) { element('sqlEditor').value = example.query; runCurrentQuery(); }
    });
    element('sqlEditor').addEventListener('input', syncExampleSelection);
    element('createTableBtn').addEventListener('click', function () { openTableEditor(null); });
    element('clearCustomDataBtn').addEventListener('click', clearCustomData);
    element('resetDemoBtn').addEventListener('click', resetDemo);
    element('themeToggleBtn').addEventListener('click', function () { global.SqlFlow.ui.toggleTheme(); });
    element('presentationModeBtn').addEventListener('click', function () { global.SqlFlow.ui.togglePresentationMode(); });
    document.querySelectorAll('[data-academic-section]').forEach(function (button) { button.addEventListener('click', function () { global.SqlFlow.help.stop(false); if (button.dataset.academicSection === 'quiz') { global.SqlFlow.quiz.openTopic('all'); } else { global.SqlFlow.academic.open(button.dataset.academicSection); } }); });
    element('closeAcademicBtn').addEventListener('click', function () { global.SqlFlow.academic.close(); });
    element('academicModal').addEventListener('click', function (event) { if (event.target === element('academicModal')) { global.SqlFlow.academic.close(); } });
    global.SqlFlow.academic.bindReportControls();
    document.querySelectorAll('[data-quick-example]').forEach(function (button) {
      button.addEventListener('click', function () {
        const index = Number(button.dataset.quickExample);
        element('exampleQueries').value = String(index);
        element('sqlEditor').value = global.SqlFlow.examples[index].query;
        runCurrentQuery();
      });
    });
    document.querySelectorAll('.help-tip').forEach(function (button) {
      button.addEventListener('click', function () { showHelp(button); });
      button.addEventListener('blur', function () { document.querySelectorAll('.help-popover').forEach(function (popover) { popover.remove(); }); });
    });
    element('closeTableEditorBtn').addEventListener('click', closeTableEditor);
    element('cancelTableEditorBtn').addEventListener('click', closeTableEditor);
    element('saveCustomTableBtn').addEventListener('click', saveTableEditor);
    element('addColumnBtn').addEventListener('click', function () {
      collectEditorRows(); collectEditorSchema();
      editorState.columns.push({ name: '', type: 'TEXT' });
      editorState.rows.forEach(function (row) { row.push(''); });
      renderColumnEditor(); renderRowsEditor();
    });
    element('addCustomRowBtn').addEventListener('click', function () {
      collectEditorRows(); collectEditorSchema();
      if (!editorState.columns.length) { showTableEditorError('Add at least one column before adding rows.'); return; }
      editorState.rows.push(editorState.columns.map(function () { return ''; }));
      renderRowsEditor();
    });
    element('clearCustomRowsBtn').addEventListener('click', function () { editorState.rows = []; renderRowsEditor(); });
    element('importCsvBtn').addEventListener('click', function () { element('csvFileInput').click(); });
    element('csvFileInput').addEventListener('change', function (event) { importCsvFile(event.target.files[0]); });
    element('tableEditorModal').addEventListener('click', function (event) { if (event.target === element('tableEditorModal')) { closeTableEditor(); } });
    global.SqlFlow.ui.installKeyboardShortcuts({
      run: runCurrentQuery,
      next: global.SqlFlow.visualizer.nextStep,
      previous: global.SqlFlow.visualizer.previousStep,
      escape: closeTransientPanel
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    global.SqlFlow.ui.initializeTheme();
    populateExamples();
    global.SqlFlow.academic.initialize({ tryQuery: function (query) { element('sqlEditor').value = query; syncExampleSelection(); runCurrentQuery(); } });
    const learning = {
      tryQuery: function (query) { global.SqlFlow.help.stop(false); global.SqlFlow.academic.close(); element('sqlEditor').value = query; syncExampleSelection(); runCurrentQuery(); },
      prepareQuery: function (query) { element('sqlEditor').value = query; syncExampleSelection(); global.SqlFlow.visualizer.resetVisualization(); global.SqlFlow.academic.setResult(null); },
      openLesson: global.SqlFlow.academic.openLesson,
      openQuiz: function (topic) { global.SqlFlow.quiz.openTopic(topic); },
      animate: function (topic) { const match = global.SqlFlow.quizBank.topics.find(function (item) { return item.id === topic; }); const query = global.SqlFlow.academic.topics[match ? match.lesson : 0][2]; learning.tryQuery(query); },
      openHelp: function (topic) { global.SqlFlow.help.openTopic(topic); }
    };
    global.SqlFlow.help.initialize(learning); global.SqlFlow.quiz.initialize(learning);
    element('startGuidedTour').addEventListener('click', function () { global.SqlFlow.help.start('first'); });
    document.querySelectorAll('[data-join-learning]').forEach(function (button) { button.addEventListener('click', function () { if (button.dataset.joinLearning === 'lab') { learning.animate('inner'); } else if (button.dataset.joinLearning === 'help') { learning.openHelp('join'); } else { learning.openQuiz('inner'); } }); });
    refreshDatabaseExplorer('students');
    const storageError = global.SqlFlow.database.getLastStorageError();
    if (storageError) { showDatabaseMessage(storageError); }
    attachEvents();
    global.SqlFlow.visualizer.renderTransactionState(global.SqlFlow.transactions.getState());
    element('sqlEditor').value = defaultQuery;
    syncExampleSelection();
    runCurrentQuery();
  });

  global.SqlFlow.app = {
    runCurrentQuery: runCurrentQuery,
    resetDemo: resetDemo,
    clearCustomData: clearCustomData,
    closeTransientPanel: closeTransientPanel
  };
})(typeof window !== 'undefined' ? window : globalThis);
