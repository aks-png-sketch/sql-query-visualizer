(function (global) {
  'use strict';
  function snapshot(stage, cursor) {
    const trace = stage.simulation;
    if (!trace || trace.summaryOnly) { return { rows: stage.rows, action: null }; }
    let rows = [];
    trace.actions.slice(0, Math.max(0, cursor)).forEach(function (action) {
      if (action.output) { rows = action.output.slice(); }
      if (action.append) { rows.push(action.append); }
    });
    return { rows: rows, action: cursor ? trace.actions[cursor - 1] : null };
  }
  function node(parent, tag, text, className) {
    const el = parent.ownerDocument.createElement(tag); el.textContent = text || '';
    if (className) { el.className = className; } parent.appendChild(el); return el;
  }
  function table(parent, columns, rows, activeIndex, accepted, highlights, options) {
    const wrap = node(parent, 'div', '', 'learning-table-wrap'); const tableEl = node(wrap, 'table', '', 'data-table');
    const head = node(node(tableEl, 'thead'), 'tr'); columns.forEach(function (column) { node(head, 'th', column); });
    if(options&&options.states)node(head,'th','Replay state');
    const body = node(tableEl, 'tbody');
    rows.forEach(function (row, index) { const tr = node(body, 'tr'); const state=options&&options.states?options.states.get(index)||options.idle||'Waiting':null;if (index === activeIndex) { tr.className = 'simulation-current-row '+(state==='Processing'?'simulation-processing':accepted?'simulation-accepted':'simulation-rejected'); tr.setAttribute('aria-label','Current row: '+(state|| (accepted?'accepted':'rejected'))); } columns.forEach(function (column) { const missing=row[column]===null||row[column]===undefined;const td = node(tr, 'td', missing?'NULL':row[column]==='NULL'?'"NULL"':String(row[column]));if(missing){td.classList.add('null-cell');td.setAttribute('aria-label','NULL: missing value');}if ((highlights || []).some(function (key) { return key === column || key.endsWith('.' + column); })) { td.classList.add('simulation-key'); } });if(state)node(tr,'td',state,'simulation-row-state'); });
    if (!rows.length) { node(parent, 'p', '0 rows', 'empty-state'); }
    return wrap;
  }
  function code(parent, sql) {
    const pre=node(parent,'pre','', 'quiz-code'); const text=String(sql);
    try { const tokens=global.SqlFlow.parser.tokenize(text).filter(function(t){return t.type!=='EOF';}); if(tokens.length){pre.appendChild(pre.ownerDocument.createTextNode(text.slice(0,tokens[0].position)));tokens.forEach(function(token,index){const piece=text.slice(token.position,index+1<tokens.length?tokens[index+1].position:text.length);const span=node(pre,'span',piece);if(['KEYWORD','AGGREGATE'].includes(token.type))span.className='sql-keyword';else if(token.type==='STRING')span.className='sql-string';else if(token.type==='NUMBER')span.className='sql-number';});}else{pre.textContent=text;} } catch(_){pre.textContent=text;}
    return pre;
  }
  function createPlayer(host, stage, options) {
    const settings = options || {}; const trace = stage.simulation; let cursor = 0, timer = null, generation = 0, speed = 1, destroyed = false, processing=false, lastOutputCount=0;
    const actions = trace && !trace.summaryOnly ? trace.actions : [];
    host.replaceChildren(); host.classList.add('simulation-panel');
    node(host, 'h3', stage.label + ' — action replay');
    node(host,'p',trace&&trace.operation||stage.description,'simulation-operation');
    node(host,'p',stage.description+' Replay shows measured logical decisions; the source data remains unchanged.','simulation-presenter-note');
    if (!trace || trace.summaryOnly) { node(host, 'p', trace ? 'This stage exceeds the replay budget (1,000 input rows, 2,000 actions, or 200 grouping/aggregate input rows). The complete measured stage result is shown below.' : 'This operation has a measured stage summary but no row-action trace.'); table(host, stage.columns, stage.rows); return { pause: function () {}, destroy: function () { host.replaceChildren(); }, state: function () { return { cursor: 0, total: 0, playing: false }; } }; }
    const controls = node(host, 'div', '', 'simulation-controls'); const buttons = {};
    function button(key, label, callback) { const item = node(controls, 'button', label); item.type = 'button'; item.title = ({play:'Play measured actions without changing source data.',pause:'Stop action playback at the current state.',previous:'Reconstruct the preceding recorded state.',next:'Display the next measured action.',restart:'Restart this stage with empty output.',final:'Reveal this stage’s complete output.'})[key]; item.dataset.simulationAction = key; if (settings.primary) { item.id = 'simulation' + key[0].toUpperCase() + key.slice(1); } item.addEventListener('click', callback); buttons[key] = item; }
    button('play', 'Play', play); button('pause', 'Pause', pause);
    button('previous', 'Previous Action', function () { seek(cursor - 1); });
    button('next', 'Next Action', function () { seek(cursor + 1); });
    button('restart', 'Restart Stage', function () { seek(0); });
    button('final', 'Skip to Final', function () { seek(actions.length); });
    const speedLabel = node(controls, 'label', 'Speed '); const speedSelect = node(speedLabel, 'select'); speedSelect.setAttribute('aria-label', 'Simulation playback speed'); if (settings.primary) { speedSelect.id = 'simulationSpeed'; }
    [0.5, 1, 1.5, 2].forEach(function (value) { const option = node(speedSelect, 'option', value + 'x'); option.value = String(value); option.selected = value === 1; });
    speedSelect.addEventListener('change', function () { const wasPlaying = timer !== null; pause();const next=Number(speedSelect.value); speed = [0.5,1,1.5,2].includes(next)?next:1;speedSelect.value=String(speed); if (wasPlaying) { play(); } });
    const progress = node(host, 'progress'); progress.max = Math.max(1, actions.length); progress.setAttribute('aria-label', 'Actions completed');
    const status = node(host, 'p', '', 'simulation-status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    const explanation = node(host, 'p', '', 'simulation-message');
    const current=node(host,'section','','simulation-current');current.setAttribute('aria-label','Current action evidence');
    const orderMap=node(host,'section','','simulation-order-map');
    const panels = node(host, 'div', '', 'simulation-relations');
    const source = node(panels, 'section'); node(source, 'h4', 'Source / current input'); const sourceTable = node(source, 'div');
    let rightTable = null; if (trace.rightRows) { const right = node(panels, 'section'); node(right, 'h4', 'Right input'); rightTable = node(right, 'div'); }
    const output = node(panels, 'section'); node(output, 'h4', 'Output so far'); const outputTable = node(output, 'div');
    const aggregate = node(host, 'div', '', 'simulation-aggregate');
    function valueText(value){return value===null||value===undefined?'NULL':Array.isArray(value)?'('+value.map(valueText).join(', ')+')':typeof value==='string'?JSON.stringify(value):String(value);}
    function decision(action){if(processing)return 'Processing';if(!action)return 'Waiting';return action.decision||(action.accepted?'Accepted':'Rejected');}
    function renderRelation(target,columns,rows,index,accepted,highlights,states){const old=target.querySelector('.learning-table-wrap'),scroll=old?old.scrollTop:0;target.replaceChildren();const wrap=table(target,columns,rows,index,accepted,highlights,states?{states:states,idle:trace.kind==='JOIN'?'Not current':'Waiting'}:null);wrap.scrollTop=scroll;const active=wrap.querySelector('.simulation-current-row');if(active){const top=active.getBoundingClientRect().top-wrap.getBoundingClientRect().top+wrap.scrollTop;if(top<wrap.scrollTop+35)wrap.scrollTop=Math.max(0,top-35);else if(top+active.offsetHeight>wrap.scrollTop+wrap.clientHeight)wrap.scrollTop=top+active.offsetHeight-wrap.clientHeight;}}
    function render() {
      if (destroyed) { return; }
      const view = snapshot(stage, cursor); const action = processing?actions[cursor]:view.action;const label=decision(action);
      progress.value = cursor; status.textContent = 'Completed ' + cursor + ' of ' + actions.length + ' actions · ' + view.rows.length + (stage.label==='GROUP BY'?' output buckets':' output rows') + (processing?' · Processing action '+(cursor+1):cursor === actions.length ? ' · Complete' : '')+(processing&&timer===null?' (paused)':'');
      explanation.textContent = processing?'Inspect the current input and operands before revealing its recorded decision.':action ? action.message : !actions.length ? 'No rows enter this operation; the measured output is empty.' : 'Output starts empty. Use Next Action or Play to inspect measured execution decisions.';
      const states=new Map();if(trace.kind!=='JOIN')actions.slice(0,cursor).forEach(function(a){if(a.inputIndex!==undefined)states.set(a.inputIndex,a.decision||(a.accepted?'Accepted':'Rejected'));});if(action&&action.inputIndex!==undefined)states.set(action.inputIndex,label);
      if(trace.kind==='JOIN'&&!source.querySelector('.simulation-pair-note')){const note=node(source,'p','State refers to the current pair or preservation action, not overall left-row eligibility.','simulation-pair-note');source.insertBefore(note,sourceTable);}
      renderRelation(sourceTable,trace.inputColumns,trace.inputRows,action&&action.inputIndex,action&&action.accepted,trace.highlightColumns,states);
      if (rightTable) { const rightStates=new Map();if(action&&action.rightIndex!==undefined)rightStates.set(action.rightIndex,label);renderRelation(rightTable,trace.rightColumns,trace.rightRows,action&&action.rightIndex,action&&action.accepted,trace.highlightColumns,rightStates); }
      const bucketStates=stage.label==='GROUP BY'?new Map(view.rows.map(function(_,index){return[index,'Bucket '+(index+1)];})):null;renderRelation(outputTable,stage.columns,view.rows,stage.label==='GROUP BY'&&action&&!processing?action.bucketIndex:undefined,true,null,bucketStates);
      if(view.rows.length>lastOutputCount){const row=outputTable.querySelector('tbody tr:last-child');if(row)row.classList.add('simulation-enter');}lastOutputCount=view.rows.length;
      current.replaceChildren();node(current,'h4','Current decision: '+label,'simulation-decision');
      if(action){
        const cards=node(current,'div','','simulation-evidence-grid'),details=node(cards,'section','','simulation-evidence-detail');
        if(action.inputIndex!==undefined){const card=node(cards,'section');node(card,'p',(trace.kind==='JOIN'?'Left input row ':'Input occurrence ')+(action.inputIndex+1));const row=trace.inputRows[action.inputIndex];if(row)table(card,trace.inputColumns,[row]);}
        if(trace.kind==='JOIN'){const card=node(cards,'section');if(action.rightIndex!==undefined){node(card,'p','Right input row '+(action.rightIndex+1));table(card,trace.rightColumns,[trace.rightRows[action.rightIndex]]);}else if(action.nullExtension){node(card,'p','No matching right row. Right cells are NULL-extended.');table(card,trace.rightColumns,[Object.fromEntries(trace.rightColumns.map(function(column){return[column,null];}))]);}}
        (action.predicateValues||[]).forEach(function(item){const comparison=item.operator.startsWith('IS ')?item.operator:item.operator+' '+(item.rightLabel?item.rightLabel+' = ':'')+valueText(item.compareTo)+(item.escape===null||item.escape===undefined?'':' ESCAPE '+valueText(item.escape));node(details,'p',item.label+' = '+valueText(item.value)+'; compare '+comparison+' → '+(processing?'Processing':item.unknown?'UNKNOWN (not a passing comparison)':item.result?'True':'False'),'simulation-predicate-value');});
        if(action.groupKey){node(details,'p','Bucket '+(action.bucketIndex+1)+' · key '+JSON.stringify(action.groupKey)+(action.groupCount?' · '+action.groupCount+(processing?' members after this assignment (pending)':' member rows'):''));}
        if(action.duplicateOf!==null&&action.duplicateOf!==undefined&&!processing)node(details,'p','Duplicate of input occurrence '+(action.duplicateOf+1)+'. No output is appended.');
        if(action.fromPosition!==undefined)node(details,'p','Input position '+action.fromPosition+' → '+(processing?'target ':'')+'output position '+action.toPosition+' · '+trace.ordering.terms.map(function(term,index){return term.label+' = '+valueText(action.orderingKeys[index])+' '+term.direction;}).join(', '));
        if(action.append&&!processing){const card=node(cards,'section','',trace.kind==='JOIN'?'simulation-output-contribution':'');node(card,'p','Output tuple contributed by this action:');table(card,stage.columns,[action.append]);}
        if(!details.childNodes.length)details.remove();
      }else node(current,'p','No row has been processed yet.');
      orderMap.replaceChildren();if(trace.ordering){node(orderMap,'h4','Unsorted input → measured final positions');node(orderMap,'p','Ordering evidence does not add columns to the projected result.');const placements=new Map(actions.slice(0,cursor).map(function(a){return[a.inputIndex,a.toPosition];}));table(orderMap,['Input position','Keys and values','Output position'],trace.ordering.keys.map(function(key){return{'Input position':key.inputIndex+1,'Keys and values':trace.ordering.terms.map(function(term,index){return term.label+'='+valueText(key.values[index])+' '+term.direction;}).join(', '),'Output position':placements.get(key.inputIndex)||'Waiting'};}),action&&action.inputIndex,action&&action.accepted,['Keys and values'],{states:new Map(action?[[action.inputIndex,label]]:[])});}
      const aggregateAction=processing?(view.action&&action&&view.action.bucketIndex===action.bucketIndex?view.action:null):action;
      aggregate.replaceChildren(); if (aggregateAction && aggregateAction.aggregateState) { node(aggregate, 'h4', 'Running state after completed actions'); table(aggregate, Object.keys(aggregateAction.aggregateState), [aggregateAction.aggregateState]); }
      if(aggregateAction&&aggregateAction.aggregateDetails){node(aggregate,'p','COUNT(*) contributions are rows; other functions count populated operand values.');table(aggregate,['Aggregate','Consumed rows','Contributions','Running value'],aggregateAction.aggregateDetails.map(function(detail){return{Aggregate:detail.label,'Consumed rows':detail.consumed,Contributions:detail.contributing,'Running value':detail.value};}));}
      buttons.previous.disabled = cursor === 0; buttons.next.disabled = cursor >= actions.length; buttons.play.disabled = timer !== null || cursor >= actions.length; buttons.pause.disabled = timer === null;
      if (settings.onChange) { settings.onChange({ cursor: cursor, total: actions.length, rows: view.rows }); }
    }
    function pause() { generation++; if (timer !== null) { global.clearTimeout(timer); timer = null; } if (!destroyed) { render(); } }
    function seek(next) { pause();processing=false; cursor = Math.min(actions.length, Math.max(0, Number(next)||0)); render(); }
    function play() {
      if (destroyed || timer !== null || cursor >= actions.length) { return; }
      if (settings.onPlay) { settings.onPlay(); }
      const run = ++generation;
      function beginAction(){if(destroyed||generation!==run)return;processing=true;timer=global.setTimeout(commitAction,600/speed);render();}
      function commitAction(){if(destroyed||generation!==run)return;processing=false;cursor++;timer=cursor<actions.length?global.setTimeout(beginAction,1100/speed):null;render();}
      beginAction();
    }
    render();
    return { pause: pause, play: play, seek: seek, destroy: function () { pause(); destroyed = true; host.replaceChildren(); }, state: function () { return { cursor: cursor, total: actions.length, playing: timer !== null, speed: speed,processing:processing }; } };
  }
  let current = null, currentStage = null;
  function show(stage) { const host = global.document.getElementById('simulationContainer'); if (!host) { return; } host.classList.remove('hidden'); if (stage === currentStage) { return; } reset(); currentStage = stage; current = createPlayer(host, stage, { primary: true, onPlay: function () { global.SqlFlow.visualizer.stopAutoPlay(); } }); }
  function pause() { if (current) { current.pause(); } }
  function reset() { if (current) { current.destroy(); } current = null; currentStage = null; }
  function hide() { pause(); const host = global.document.getElementById('simulationContainer'); if (host) { host.classList.add('hidden'); } }
  global.SqlFlow = global.SqlFlow || {}; global.SqlFlow.simulation = { snapshot: snapshot, createPlayer: createPlayer, show: show, pause: pause, reset: reset, hide: hide, table: table, code:code, getPlayer: function () { return current; } };
})(typeof window !== 'undefined' ? window : globalThis);
