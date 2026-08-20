(function (global) {
  'use strict';

  const state = { executionResult: null, currentStep: 0, activeTab: 'execution', autoPlayTimer: null };

  function getElement(id) { return document.getElementById(id); }
  function clearElement(element) { if (element) { element.replaceChildren(); } }
  function appendTextElement(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) { element.className = className; }
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function stopAutoPlay() {
    if (state.autoPlayTimer) { clearInterval(state.autoPlayTimer); state.autoPlayTimer = null; }
    const button = getElement('autoPlayBtn');
    if (button) { button.textContent = 'Auto Play'; }
  }

  function createTable(columns, rows, options) {
    const wrapper = document.createElement('div');
    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(function (column) { appendTextElement(headerRow, 'th', '', column); });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      const tableRow = document.createElement('tr');
      columns.forEach(function (column) {
        const value = row[column];
        const classes = [];
        if (column === 'grouped_rows') { classes.push('grouped-rows-cell'); }
        if (value === null || value === undefined) { classes.push('null-cell'); }
        if (options && options.highlightColumns && options.highlightColumns.some(function (highlight) {
          return highlight === column || highlight.endsWith('.' + column);
        })) { classes.push('join-key-cell'); }
        appendTextElement(
          tableRow,
          'td',
          classes.join(' '),
          value === null || value === undefined ? 'NULL' : String(value)
        );
      });
      tbody.appendChild(tableRow);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    if (rows.length === 0) { appendTextElement(wrapper, 'div', 'empty-state', '0 rows — no matching rows.'); }
    return wrapper;
  }

  function renderTableInto(container, columns, rows) {
    if (!container) { return; }
    container.replaceChildren(createTable(columns || [], rows || []));
  }

  function createJoinVisualization(details) {
    const panel = document.createElement('div');
    panel.className = 'join-visualization';

    const inputs = document.createElement('div');
    inputs.className = 'join-inputs';
    const left = document.createElement('section');
    left.className = 'join-input-card';
    appendTextElement(left, 'div', 'join-card-label', 'LEFT INPUT');
    appendTextElement(left, 'h3', '', details.leftName);
    const conditionColumns = details.condition.split(' = ');
    left.appendChild(createTable(details.leftColumns, details.leftRows, { highlightColumns: [conditionColumns[0]] }));

    const condition = document.createElement('div');
    condition.className = 'join-condition';
    appendTextElement(condition, 'span', '', details.condition);
    appendTextElement(condition, 'span', 'join-arrow', '↓');

    const right = document.createElement('section');
    right.className = 'join-input-card';
    appendTextElement(right, 'div', 'join-card-label', 'RIGHT TABLE');
    appendTextElement(right, 'h3', '', details.rightName);
    right.appendChild(createTable(details.rightColumns, details.rightRows, { highlightColumns: [conditionColumns[1]] }));
    inputs.appendChild(left);
    inputs.appendChild(condition);
    inputs.appendChild(right);
    panel.appendChild(inputs);

    const stats = document.createElement('div');
    stats.className = 'join-stats';
    appendTextElement(stats, 'span', '', details.comparisons + ' comparisons');
    appendTextElement(stats, 'span', '', details.matchedRows + ' matched rows');
    if (details.unmatchedRows > 0) { appendTextElement(stats, 'span', '', details.unmatchedRows + ' unmatched left rows'); }
    appendTextElement(stats, 'span', '', details.outputRows + ' output rows');
    panel.appendChild(stats);
    appendTextElement(panel, 'div', 'join-output-label', 'MATCHED OUTPUT');
    return panel;
  }

  function transitionCue(stage, stageIndex) {
    const previous = stageIndex > 0 ? state.executionResult.stages[stageIndex - 1] : null;
    const inputCount = previous ? previous.rows.length : stage.rows.length;
    const outputCount = stage.rows.length;
    if (stage.label === 'WHERE') { return (inputCount - outputCount) + ' rows filtered out; ' + outputCount + ' rows continue.'; }
    if (stage.label === 'SELECT' || stage.label === 'SELECT / AGGREGATE') { return 'The result shape changes to ' + stage.columns.length + ' visible columns.'; }
    if (stage.label === 'ORDER BY') { return outputCount + ' rows reordered using the requested sort key.'; }
    if (stage.label === 'GROUP BY') { return inputCount + ' rows collected into ' + outputCount + ' groups.'; }
    if (stage.label === 'HAVING') { return (inputCount - outputCount) + ' groups removed after aggregation.'; }
    if (stage.label === 'DISTINCT') { return (inputCount - outputCount) + ' duplicate rows removed.'; }
    if (stage.label === 'LIMIT') { return outputCount + ' rows retained; ' + Math.max(0, inputCount - outputCount) + ' rows excluded by the limit.'; }
    if (stage.joinDetails) { return stage.joinDetails.matchedRows + ' matches highlighted from ' + stage.joinDetails.comparisons + ' comparisons.'; }
    if (['INSERT', 'UPDATE', 'DELETE', 'COMMIT', 'ROLLBACK', 'ROLLBACK TO'].includes(stage.label)) { return stage.description; }
    return '';
  }

  function renderStageInto(container, stage, stageIndex) {
    container.replaceChildren();
    const cue = transitionCue(stage, stageIndex);
    if (cue) { appendTextElement(container, 'div', 'stage-transition-cue', cue); }
    if (stage.joinDetails) { container.appendChild(createJoinVisualization(stage.joinDetails)); }
    const table = createTable(stage.columns || [], stage.rows || []);
    table.classList.add('stage-transition-table');
    container.appendChild(table);
  }

  function renderDatabasePreview(table) {
    const container = getElement('tablePreview');
    if (!container) { return; }
    if (!table || !table.rows) { clearElement(container); container.classList.add('hidden'); return; }
    renderTableInto(container, table.columns, table.rows);
    container.classList.remove('hidden');
  }

  function toggleDatabasePreview(table) {
    const container = getElement('tablePreview');
    if (!container) { return; }
    if (!container.classList.contains('hidden')) { container.classList.add('hidden'); return; }
    renderDatabasePreview(table);
  }

  function updateControls() {
    const hasResult = Boolean(state.executionResult);
    const isStepView = state.activeTab === 'execution' || state.activeTab === 'explanation';
    const lastStep = hasResult ? state.executionResult.stages.length - 1 : 0;
    getElement('prevStepBtn').disabled = !hasResult || !isStepView || state.currentStep <= 0;
    getElement('nextStepBtn').disabled = !hasResult || !isStepView || state.currentStep >= lastStep;
    getElement('autoPlayBtn').disabled = !hasResult || !isStepView || lastStep <= 0;
    document.querySelectorAll('.tab[data-tab="algebra"], .tab[data-tab="tree"]').forEach(function (tab) {
      tab.disabled = !hasResult || !state.executionResult.queryPlan;
    });
  }

  function renderExecutionFlow() {
    const container = getElement('executionFlow');
    clearElement(container);
    if (!container || !state.executionResult) { return; }
    const stages = state.executionResult.stages.map(function (stage, index) {
      return { label: stage.label, description: stage.description, index: index };
    });
    stages.push({
      label: 'RESULT',
      description: state.executionResult.parsed.orderBy ? 'Displays the final sorted result table.' : 'Displays the final result table.',
      index: stages.length
    });
    stages.forEach(function (stage) {
      const card = document.createElement('div');
      const active = state.activeTab === 'result' ? stage.index === stages.length - 1 : state.currentStep === stage.index;
      card.className = 'flow-card' + (active ? ' active' : '');
      const header = document.createElement('div');
      header.className = 'flow-card-header';
      appendTextElement(header, 'span', 'flow-step', 'Stage ' + (stage.index + 1));
      appendTextElement(header, 'span', 'flow-label', stage.label);
      card.appendChild(header);
      appendTextElement(card, 'p', '', stage.description);
      container.appendChild(card);
    });
  }

  function hideVisualizationContainers() {
    ['executionTableContainer', 'finalResultContainer', 'relationalAlgebraContainer', 'queryTreeContainer', 'explanationContainer'].forEach(function (id) {
      const container = getElement(id);
      if (container) { container.classList.add('hidden'); }
    });
  }

  function statLabel(key) {
    return ({ inputRows: 'Input rows', outputRows: 'Output rows', rowsRemoved: 'Removed', inputColumns: 'Columns before', outputColumns: 'Columns after', groups: 'Groups', comparisons: 'Comparisons', matchedRows: 'Matches', unmatchedLeftRows: 'Unmatched left', affectedRows: 'Affected rows', rowsBefore: 'Rows before', rowsAfter: 'Rows after', pendingChanges: 'Pending changes' })[key] || key;
  }

  function renderExplanation(explanation) {
    const container = getElement('explanationContainer');
    container.replaceChildren();
    appendTextElement(container, 'p', 'explanation-intro', 'SQLFlow explains each operation in plain English using the actual data produced during execution. Use this view when execution tables or relational algebra are unfamiliar.');
    if (!explanation || !explanation.steps.length) {
      appendTextElement(container, 'div', 'empty-state', 'Run a query to generate its explanation.');
      return;
    }
    const list = document.createElement('div');
    list.className = 'explanation-list';
    explanation.steps.forEach(function (step) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'explanation-card' + (step.stageIndex === state.currentStep || explanation.steps.length === 1 ? ' active' : '');
      card.dataset.stageIndex = String(step.stageIndex);
      card.setAttribute('aria-label', step.title + '. Open this execution stage.');
      appendTextElement(card, 'h3', 'explanation-title', step.title);
      if (step.clause) { appendTextElement(card, 'code', 'explanation-clause', step.clause); }
      appendTextElement(card, 'h4', '', 'What happened');
      appendTextElement(card, 'p', '', step.whatHappened);
      appendTextElement(card, 'h4', '', 'Why this step exists');
      appendTextElement(card, 'p', '', step.whyItMatters);
      const stats = document.createElement('div');
      stats.className = 'explanation-stats';
      Object.keys(step.stats || {}).forEach(function (key) {
        const item = step.stats[key];
        if (item === null || item === undefined || Array.isArray(item)) { return; }
        appendTextElement(stats, 'span', '', statLabel(key) + ': ' + item);
      });
      if (stats.childNodes.length) { card.appendChild(stats); }
      card.addEventListener('click', function () { selectExecutionStage(step.stageIndex); });
      list.appendChild(card);
    });
    container.appendChild(list);
    const summary = document.createElement('section');
    summary.className = 'explanation-summary';
    appendTextElement(summary, 'h3', '', 'Final Summary');
    appendTextElement(summary, 'p', '', explanation.summary);
    container.appendChild(summary);
  }

  function renderRelationalAlgebra(plan) {
    const container = getElement('relationalAlgebraContainer');
    container.replaceChildren();
    appendTextElement(container, 'p', 'plan-help', plan.explanation + ' Projection chooses columns; selection filters rows; grouping creates aggregate groups.');
    const toolbar = document.createElement('div');
    toolbar.className = 'plan-toolbar';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = 'Copy Algebra';
    const copyStatus = appendTextElement(toolbar, 'span', 'copy-status', '');
    copyButton.addEventListener('click', function () {
      global.SqlFlow.queryplan.copyText(plan.algebra).then(function () { copyStatus.textContent = 'Copied'; })
        .catch(function (error) { copyStatus.textContent = error.message; });
    });
    toolbar.insertBefore(copyButton, copyStatus);
    container.appendChild(toolbar);
    appendTextElement(container, 'pre', 'relational-algebra-expression', plan.algebra);
    const legend = document.createElement('div');
    legend.className = 'operator-legend';
    plan.legend.forEach(function (item) {
      const entry = document.createElement('div');
      appendTextElement(entry, 'span', 'operator-symbol', item.symbol);
      appendTextElement(entry, 'span', '', item.label);
      legend.appendChild(entry);
    });
    container.appendChild(legend);
  }

  function renderQueryTreeNode(planNode) {
    const wrapper = document.createElement('div');
    wrapper.className = 'query-tree-branch';
    const nodeButton = document.createElement('button');
    nodeButton.type = 'button';
    nodeButton.className = 'query-tree-node' + (planNode.stageIndex === state.currentStep ? ' active' : '');
    if (planNode.stageIndex === null) { nodeButton.classList.add('informational'); nodeButton.disabled = true; }
    appendTextElement(nodeButton, 'span', 'tree-operation', planNode.type);
    appendTextElement(nodeButton, 'span', 'tree-clause', planNode.text);
    if (planNode.stats) {
      const parts = [planNode.stats.inputRows + ' rows → ' + planNode.stats.outputRows + ' rows'];
      if (planNode.stats.comparisons !== undefined) { parts.push(planNode.stats.comparisons + ' comparisons'); }
      if (planNode.stats.matches !== undefined) { parts.push(planNode.stats.matches + ' matches'); }
      if (planNode.stats.groups !== undefined) { parts.push(planNode.stats.groups + ' groups'); }
      appendTextElement(nodeButton, 'span', 'tree-stats', parts.join(' · '));
    }
    if (planNode.stageIndex !== null) {
      nodeButton.dataset.stageIndex = String(planNode.stageIndex);
      nodeButton.addEventListener('click', function () { selectExecutionStage(planNode.stageIndex); });
    }
    wrapper.appendChild(nodeButton);
    if (planNode.children.length) {
      const children = document.createElement('div');
      children.className = 'query-tree-children' + (planNode.children.length > 1 ? ' multiple' : '');
      planNode.children.forEach(function (child) { children.appendChild(renderQueryTreeNode(child)); });
      wrapper.appendChild(children);
    }
    return wrapper;
  }

  function renderQueryTree(plan) {
    const container = getElement('queryTreeContainer');
    container.replaceChildren();
    appendTextElement(container, 'p', 'plan-help', plan.explanation);
    const toolbar = document.createElement('div');
    toolbar.className = 'plan-toolbar';
    const fitButton = appendTextElement(toolbar, 'button', '', 'Fit View');
    fitButton.type = 'button';
    const collapseButton = appendTextElement(toolbar, 'button', 'secondary', 'Collapse Tree');
    collapseButton.type = 'button';
    container.appendChild(toolbar);
    const tree = document.createElement('div');
    tree.className = 'query-tree';
    tree.appendChild(renderQueryTreeNode(plan.root));
    container.appendChild(tree);
    fitButton.addEventListener('click', function () {
      tree.classList.toggle('compact');
      fitButton.textContent = tree.classList.contains('compact') ? 'Reset View' : 'Fit View';
    });
    collapseButton.addEventListener('click', function () {
      tree.classList.toggle('hidden');
      collapseButton.textContent = tree.classList.contains('hidden') ? 'Expand Tree' : 'Collapse Tree';
    });
  }

  function selectExecutionStage(stageIndex) {
    if (!state.executionResult) { return; }
    state.currentStep = Math.max(0, Math.min(state.executionResult.stages.length - 1, stageIndex));
    setTab('execution');
  }

  function renderStageView() {
    if (!state.executionResult) { updateControls(); return; }
    const description = getElement('executionStageDescription');
    const executionContainer = getElement('executionTableContainer');
    const resultContainer = getElement('finalResultContainer');
    const algebraContainer = getElement('relationalAlgebraContainer');
    const treeContainer = getElement('queryTreeContainer');
    const explanationContainer = getElement('explanationContainer');
    const counter = getElement('stepCounter');
    hideVisualizationContainers();
    if (state.activeTab === 'execution') {
      const stage = state.executionResult.stages[state.currentStep];
      description.textContent = stage.description;
      renderStageInto(executionContainer, stage, state.currentStep);
      executionContainer.classList.remove('hidden');
      counter.textContent = 'Step ' + (state.currentStep + 1) + ' of ' + state.executionResult.stages.length;
    } else if (state.activeTab === 'result') {
      description.textContent = 'Final result table created after the full query has been processed.';
      renderTableInto(resultContainer, state.executionResult.resultColumns, state.executionResult.result);
      resultContainer.classList.remove('hidden');
      counter.textContent = 'Final Result';
    } else if (state.activeTab === 'algebra') {
      description.textContent = 'Logical relational-algebra representation of the SELECT query.';
      renderRelationalAlgebra(state.executionResult.queryPlan);
      algebraContainer.classList.remove('hidden');
      counter.textContent = 'Relational Algebra';
    } else if (state.activeTab === 'tree') {
      description.textContent = 'Logical query tree. Select an operation to inspect its execution stage.';
      renderQueryTree(state.executionResult.queryPlan);
      treeContainer.classList.remove('hidden');
      counter.textContent = 'Query Tree';
    } else {
      description.textContent = 'Plain-English explanation generated from the parsed statement and measured execution results.';
      renderExplanation(state.executionResult.explanation);
      explanationContainer.classList.remove('hidden');
      counter.textContent = 'Explanation · Step ' + (state.currentStep + 1) + ' of ' + state.executionResult.stages.length;
    }
    renderExecutionFlow();
    updateControls();
  }

  function setTab(tabName) {
    if (!['execution', 'result', 'algebra', 'tree', 'explanation'].includes(tabName)) { return; }
    if ((tabName === 'algebra' || tabName === 'tree') && (!state.executionResult || !state.executionResult.queryPlan)) { return; }
    stopAutoPlay();
    state.activeTab = tabName;
    document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.tab === tabName); });
    renderStageView();
  }

  function resetVisualization() {
    stopAutoPlay();
    state.executionResult = null;
    state.currentStep = 0;
    state.activeTab = 'execution';
    clearElement(getElement('executionFlow'));
    clearElement(getElement('executionTableContainer'));
    clearElement(getElement('finalResultContainer'));
    clearElement(getElement('relationalAlgebraContainer'));
    clearElement(getElement('queryTreeContainer'));
    clearElement(getElement('explanationContainer'));
    getElement('executionTableContainer').classList.remove('hidden');
    getElement('finalResultContainer').classList.add('hidden');
    getElement('relationalAlgebraContainer').classList.add('hidden');
    getElement('queryTreeContainer').classList.add('hidden');
    getElement('explanationContainer').classList.add('hidden');
    getElement('executionStageDescription').textContent = '';
    getElement('stepCounter').textContent = 'No query executed';
    document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.tab === 'execution'); });
    updateControls();
  }

  function showError(message) {
    resetVisualization();
    appendTextElement(getElement('executionTableContainer'), 'div', 'error-box', message);
  }

  function showExecutionResult(result) {
    resetVisualization();
    if (!result.explanation && global.SqlFlow.explanations) { result.explanation = global.SqlFlow.explanations.build(result); }
    state.executionResult = result;
    renderStageView();
  }

  function previousStep() {
    if (!state.executionResult || !['execution', 'explanation'].includes(state.activeTab)) { return; }
    state.currentStep = Math.max(0, state.currentStep - 1);
    renderStageView();
  }

  function nextStep() {
    if (!state.executionResult || !['execution', 'explanation'].includes(state.activeTab)) { return; }
    state.currentStep = Math.min(state.executionResult.stages.length - 1, state.currentStep + 1);
    renderStageView();
  }

  function toggleAutoPlay() {
    if (!state.executionResult || !['execution', 'explanation'].includes(state.activeTab)) { return; }
    if (state.autoPlayTimer) { stopAutoPlay(); return; }
    const button = getElement('autoPlayBtn');
    button.textContent = 'Stop';
    state.autoPlayTimer = setInterval(function () {
      if (state.currentStep >= state.executionResult.stages.length - 1) { stopAutoPlay(); updateControls(); return; }
      nextStep();
    }, 1400);
  }

  function renderTransactionState(transactionState) {
    const status = getElement('transactionStatus');
    if (!status || !transactionState) { return; }
    status.textContent = transactionState.active ? 'ACTIVE' : 'INACTIVE';
    status.classList.toggle('inactive', !transactionState.active);
    getElement('transactionSavepoints').textContent = transactionState.savepoints.length ? transactionState.savepoints.join(', ') : 'None';
    getElement('transactionPending').textContent = String(transactionState.pendingChanges.length);
    function stateSummary(tables) {
      return tables.length ? tables.map(function (table) { return table.table + ': ' + table.rows + ' rows'; }).join(' · ') : 'No custom tables';
    }
    getElement('transactionCommitted').textContent = stateSummary(transactionState.committedState);
    getElement('transactionWorking').textContent = stateSummary(transactionState.workingState);
    const timeline = getElement('transactionTimeline');
    timeline.replaceChildren();
    if (!transactionState.timeline.length) {
      appendTextElement(timeline, 'div', 'empty-state', 'No transaction operations yet.');
      return;
    }
    transactionState.timeline.forEach(function (event) {
      const item = document.createElement('div');
      item.className = 'timeline-item ' + String(event.status || '').toLowerCase().replace(/\s+/g, '-');
      appendTextElement(item, 'div', 'timeline-type', event.type);
      const detailParts = [];
      if (event.table) { detailParts.push(event.table); }
      if (event.affectedRows !== null) { detailParts.push(event.affectedRows + ' rows'); }
      appendTextElement(item, 'div', 'timeline-detail', detailParts.join(' · ') || 'Transaction control');
      appendTextElement(item, 'div', 'timeline-status', event.status);
      timeline.appendChild(item);
    });
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.visualizer = {
    state: state,
    renderDatabasePreview: renderDatabasePreview,
    toggleDatabasePreview: toggleDatabasePreview,
    showExecutionResult: showExecutionResult,
    showError: showError,
    resetVisualization: resetVisualization,
    previousStep: previousStep,
    nextStep: nextStep,
    toggleAutoPlay: toggleAutoPlay,
    renderTransactionState: renderTransactionState,
    selectExecutionStage: selectExecutionStage,
    setTab: setTab
  };
})(typeof window !== 'undefined' ? window : globalThis);
