(function (global) {
  'use strict';

  const KEYWORDS = new Set([
    'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AND', 'OR', 'GROUP', 'BY',
    'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
    'FULL', 'OUTER', 'CROSS', 'ON', 'AS', 'INSERT', 'INTO', 'VALUES', 'UPDATE',
    'SET', 'DELETE', 'BEGIN', 'START', 'TRANSACTION', 'COMMIT', 'ROLLBACK',
    'SAVEPOINT', 'TO'
  ]);
  const AGGREGATES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

  function syntaxError(message, token) {
    return new Error('Syntax error: ' + message + (token ? ' at character ' + (token.position + 1) : '') + '.');
  }

  function tokenize(query) {
    const input = String(query || '');
    const tokens = [];
    let index = 0;
    while (index < input.length) {
      const character = input[index];
      if (/\s/.test(character)) { index += 1; continue; }
      if (character === "'" || character === '"') {
        const quote = character;
        const start = index;
        let value = '';
        let closed = false;
        index += 1;
        while (index < input.length) {
          if (input[index] === quote) {
            if (input[index + 1] === quote) { value += quote; index += 2; continue; }
            closed = true; index += 1; break;
          }
          value += input[index]; index += 1;
        }
        if (!closed) { throw syntaxError('unterminated quoted string', { position: start }); }
        tokens.push({ type: 'STRING', value: value, position: start });
        continue;
      }
      if (/[A-Za-z_]/.test(character)) {
        const start = index;
        index += 1;
        while (index < input.length && /[A-Za-z0-9_]/.test(input[index])) { index += 1; }
        const value = input.slice(start, index);
        const upperValue = value.toUpperCase();
        tokens.push({ type: KEYWORDS.has(upperValue) ? 'KEYWORD' : 'IDENTIFIER', value: value, upperValue: upperValue, position: start });
        continue;
      }
      if (/\d/.test(character) || ((character === '-' || character === '+') && /\d/.test(input[index + 1] || ''))) {
        const start = index;
        index += 1;
        while (index < input.length && /\d/.test(input[index])) { index += 1; }
        if (input[index] === '.') {
          index += 1;
          if (!/\d/.test(input[index] || '')) { throw syntaxError('invalid number', { position: start }); }
          while (index < input.length && /\d/.test(input[index])) { index += 1; }
        }
        const raw = input.slice(start, index);
        tokens.push({ type: 'NUMBER', value: Number(raw), raw: raw, position: start });
        continue;
      }
      const doubleOperator = input.slice(index, index + 2);
      if (['!=', '>=', '<='].includes(doubleOperator)) { tokens.push({ type: 'OPERATOR', value: doubleOperator, position: index }); index += 2; continue; }
      const tokenTypes = {
        '=': 'OPERATOR', '>': 'OPERATOR', '<': 'OPERATOR', '*': 'STAR', ',': 'COMMA',
        ';': 'SEMICOLON', '(': 'LEFT_PAREN', ')': 'RIGHT_PAREN', '.': 'DOT'
      };
      if (tokenTypes[character]) { tokens.push({ type: tokenTypes[character], value: character, position: index }); index += 1; continue; }
      throw syntaxError('unexpected character "' + character + '"', { position: index });
    }
    tokens.push({ type: 'EOF', value: '', position: input.length });
    return tokens;
  }

  function Parser(tokens) { this.tokens = tokens; this.current = 0; }
  Parser.prototype.peek = function (offset) { return this.tokens[this.current + (offset || 0)] || this.tokens[this.tokens.length - 1]; };
  Parser.prototype.advance = function () { const token = this.peek(); if (token.type !== 'EOF') { this.current += 1; } return token; };
  Parser.prototype.matchType = function (type) { if (this.peek().type !== type) { return false; } this.advance(); return true; };
  Parser.prototype.matchKeyword = function (keyword) {
    const token = this.peek();
    if (token.type !== 'KEYWORD' || token.upperValue !== keyword) { return false; }
    this.advance(); return true;
  };
  Parser.prototype.expectKeyword = function (keyword) { if (!this.matchKeyword(keyword)) { throw syntaxError('expected ' + keyword, this.peek()); } };
  Parser.prototype.expectIdentifier = function (context) {
    const token = this.peek();
    if (token.type !== 'IDENTIFIER') { throw syntaxError('expected ' + context, token); }
    this.advance(); return { type: 'Identifier', name: token.value };
  };

  Parser.prototype.parseColumnReference = function (context) {
    const first = this.expectIdentifier('a column name in ' + context);
    if (!this.matchType('DOT')) { return { type: 'ColumnReference', qualifier: null, name: first.name }; }
    const column = this.expectIdentifier('a column name after the qualifier in ' + context);
    return { type: 'ColumnReference', qualifier: first.name, name: column.name };
  };

  Parser.prototype.parseTableReference = function (context) {
    const table = this.expectIdentifier('a table name ' + context);
    let alias = null;
    if (this.matchKeyword('AS')) {
      alias = this.expectIdentifier('an alias after AS');
    } else if (this.peek().type === 'IDENTIFIER') {
      alias = this.expectIdentifier('a table alias');
    }
    return { type: 'TableReference', table: table, alias: alias };
  };

  Parser.prototype.parseAggregate = function (context) {
    const functionToken = this.peek();
    if (functionToken.type !== 'IDENTIFIER' || this.peek(1).type !== 'LEFT_PAREN') {
      throw syntaxError('expected a column or aggregate expression in ' + context, functionToken);
    }
    const functionName = functionToken.value.toUpperCase();
    if (!AGGREGATES.has(functionName)) { throw syntaxError('unsupported aggregate function "' + functionToken.value + '"', functionToken); }
    this.advance();
    this.advance();
    let argument;
    if (this.matchType('STAR')) {
      if (functionName !== 'COUNT') { throw syntaxError(functionName + '(*) is invalid; only COUNT accepts *', functionToken); }
      argument = { type: 'Wildcard' };
    } else {
      if (this.peek().type !== 'IDENTIFIER') { throw syntaxError('expected a column name inside ' + functionName + '(...)', this.peek()); }
      argument = this.parseColumnReference(functionName + '(...)');
    }
    if (!this.matchType('RIGHT_PAREN')) { throw syntaxError('expected a closing parenthesis after ' + functionName + ' argument', this.peek()); }
    return { type: 'AggregateExpression', functionName: functionName, argument: argument };
  };

  Parser.prototype.parseValueExpression = function (context) {
    if (this.peek().type === 'IDENTIFIER' && this.peek(1).type === 'LEFT_PAREN') { return this.parseAggregate(context); }
    return this.parseColumnReference(context);
  };

  Parser.prototype.parseSelectList = function () {
    if (this.matchType('STAR')) { return { all: true, expressions: [] }; }
    const expressions = [this.parseValueExpression('SELECT')];
    while (this.matchType('COMMA')) { expressions.push(this.parseValueExpression('SELECT')); }
    return { all: false, expressions: expressions };
  };

  Parser.prototype.parseComparison = function (context, allowAggregates) {
    const left = allowAggregates ? this.parseValueExpression(context) : this.parseColumnReference(context);
    const operator = this.peek();
    if (operator.type !== 'OPERATOR') { throw syntaxError(context + ' comparison requires one of =, !=, >, <, >=, or <=', operator); }
    this.advance();
    const right = this.peek();
    if (right.type !== 'STRING' && right.type !== 'NUMBER') { throw syntaxError(context + ' comparison is missing a number or quoted string operand', right); }
    this.advance();
    return {
      type: 'ComparisonExpression', left: left, operator: operator.value,
      right: { type: 'Literal', value: right.value, valueType: right.type.toLowerCase() }
    };
  };

  Parser.prototype.parseBooleanPrimary = function (context, allowAggregates) {
    if (this.matchType('LEFT_PAREN')) {
      if (this.peek().type === 'RIGHT_PAREN') { throw syntaxError('empty parentheses are not a valid ' + context + ' expression', this.peek()); }
      const expression = this.parseOrExpression(context, allowAggregates);
      if (!this.matchType('RIGHT_PAREN')) { throw syntaxError('expected a closing parenthesis in ' + context, this.peek()); }
      return { type: 'GroupedExpression', expression: expression };
    }
    if (this.peek().type === 'RIGHT_PAREN') { throw syntaxError('unexpected closing parenthesis in ' + context, this.peek()); }
    return this.parseComparison(context, allowAggregates);
  };
  Parser.prototype.parseAndExpression = function (context, allowAggregates) {
    let expression = this.parseBooleanPrimary(context, allowAggregates);
    while (this.matchKeyword('AND')) {
      expression = { type: 'LogicalExpression', operator: 'AND', left: expression, right: this.parseBooleanPrimary(context, allowAggregates) };
    }
    return expression;
  };
  Parser.prototype.parseOrExpression = function (context, allowAggregates) {
    let expression = this.parseAndExpression(context, allowAggregates);
    while (this.matchKeyword('OR')) {
      expression = { type: 'LogicalExpression', operator: 'OR', left: expression, right: this.parseAndExpression(context, allowAggregates) };
    }
    return expression;
  };

  Parser.prototype.parseIdentifierList = function (context) {
    const columns = [this.parseColumnReference(context)];
    while (this.matchType('COMMA')) { columns.push(this.parseColumnReference(context)); }
    return columns;
  };

  Parser.prototype.parseJoin = function () {
    let joinType = 'INNER';
    if (this.matchKeyword('INNER')) { this.expectKeyword('JOIN'); }
    else if (this.matchKeyword('LEFT')) { joinType = 'LEFT'; this.expectKeyword('JOIN'); }
    else { this.expectKeyword('JOIN'); }
    const table = this.parseTableReference('after JOIN');
    if (!this.matchKeyword('ON')) { throw syntaxError('JOIN requires an ON condition', this.peek()); }
    const left = this.parseColumnReference('JOIN ON');
    const operator = this.peek();
    if (operator.type !== 'OPERATOR') { throw syntaxError('JOIN ON requires a column-to-column equality condition', operator); }
    this.advance();
    if (operator.value !== '=') { throw syntaxError('JOIN ON currently supports only the = operator', operator); }
    const right = this.parseColumnReference('JOIN ON');
    return { type: 'JoinClause', joinType: joinType, table: table, left: left, operator: '=', right: right };
  };
  Parser.prototype.parseLimit = function () {
    const token = this.peek();
    if (token.type !== 'NUMBER') { throw syntaxError('LIMIT requires a non-negative integer', token); }
    this.advance();
    if (!Number.isInteger(token.value) || token.value < 0) { throw syntaxError('LIMIT requires a non-negative integer', token); }
    return { type: 'LimitClause', count: token.value };
  };

  Parser.prototype.parseLiteral = function (context) {
    const token = this.peek();
    if (token.type !== 'STRING' && token.type !== 'NUMBER') { throw syntaxError(context + ' requires a number or quoted string value', token); }
    this.advance();
    return { type: 'Literal', value: token.value, valueType: token.type.toLowerCase() };
  };

  Parser.prototype.finishStatement = function () {
    this.matchType('SEMICOLON');
    if (this.peek().type !== 'EOF') { throw syntaxError('only one SQL statement can be executed at a time', this.peek()); }
  };

  Parser.prototype.parseInsertStatement = function () {
    this.expectKeyword('INSERT');
    this.expectKeyword('INTO');
    const table = this.expectIdentifier('a table name after INSERT INTO');
    let columns = null;
    if (this.matchType('LEFT_PAREN')) {
      columns = [this.expectIdentifier('a column name in INSERT')];
      while (this.matchType('COMMA')) { columns.push(this.expectIdentifier('a column name after the comma in INSERT')); }
      if (!this.matchType('RIGHT_PAREN')) { throw syntaxError('expected a closing parenthesis after INSERT columns', this.peek()); }
    }
    this.expectKeyword('VALUES');
    if (!this.matchType('LEFT_PAREN')) { throw syntaxError('expected ( after VALUES', this.peek()); }
    const values = [];
    if (this.peek().type !== 'RIGHT_PAREN') {
      values.push(this.parseLiteral('INSERT'));
      while (this.matchType('COMMA')) { values.push(this.parseLiteral('INSERT')); }
    }
    if (!this.matchType('RIGHT_PAREN')) { throw syntaxError('expected a closing parenthesis after INSERT values', this.peek()); }
    this.finishStatement();
    return { type: 'InsertStatement', table: table, columns: columns, values: values };
  };

  Parser.prototype.parseUpdateStatement = function () {
    this.expectKeyword('UPDATE');
    const table = this.expectIdentifier('a table name after UPDATE');
    this.expectKeyword('SET');
    const assignments = [];
    do {
      const column = this.expectIdentifier('a column name in SET');
      const operator = this.peek();
      if (operator.type !== 'OPERATOR' || operator.value !== '=') { throw syntaxError('UPDATE assignments require =', operator); }
      this.advance();
      assignments.push({ column: column, value: this.parseLiteral('UPDATE assignment') });
    } while (this.matchType('COMMA'));
    let where = null;
    if (this.matchKeyword('WHERE')) {
      if (['EOF', 'SEMICOLON'].includes(this.peek().type)) { throw syntaxError('WHERE is missing an expression', this.peek()); }
      where = this.parseOrExpression('WHERE', false);
    }
    this.finishStatement();
    return { type: 'UpdateStatement', table: table, assignments: assignments, where: where };
  };

  Parser.prototype.parseDeleteStatement = function () {
    this.expectKeyword('DELETE');
    this.expectKeyword('FROM');
    const table = this.expectIdentifier('a table name after DELETE FROM');
    let where = null;
    if (this.matchKeyword('WHERE')) {
      if (['EOF', 'SEMICOLON'].includes(this.peek().type)) { throw syntaxError('WHERE is missing an expression', this.peek()); }
      where = this.parseOrExpression('WHERE', false);
    }
    this.finishStatement();
    return { type: 'DeleteStatement', table: table, where: where, requiresConfirmation: !where };
  };

  Parser.prototype.parseTransactionStatement = function () {
    if (this.matchKeyword('BEGIN')) {
      this.matchKeyword('TRANSACTION');
      this.finishStatement();
      return { type: 'BeginStatement' };
    }
    if (this.matchKeyword('START')) {
      this.expectKeyword('TRANSACTION');
      this.finishStatement();
      return { type: 'BeginStatement' };
    }
    if (this.matchKeyword('COMMIT')) {
      this.finishStatement();
      return { type: 'CommitStatement' };
    }
    if (this.matchKeyword('SAVEPOINT')) {
      const name = this.expectIdentifier('a savepoint name');
      this.finishStatement();
      return { type: 'SavepointStatement', name: name.name };
    }
    this.expectKeyword('ROLLBACK');
    if (this.matchKeyword('TO')) {
      this.matchKeyword('SAVEPOINT');
      const name = this.expectIdentifier('a savepoint name after ROLLBACK TO');
      this.finishStatement();
      return { type: 'RollbackToStatement', name: name.name };
    }
    this.finishStatement();
    return { type: 'RollbackStatement' };
  };

  Parser.prototype.parseQuery = function () {
    this.expectKeyword('SELECT');
    const distinct = this.matchKeyword('DISTINCT');
    if (this.peek().type === 'KEYWORD' && this.peek().upperValue === 'DISTINCT') { throw syntaxError('DISTINCT may appear only once immediately after SELECT', this.peek()); }
    const selection = this.parseSelectList();
    if (this.peek().type === 'KEYWORD' && this.peek().upperValue === 'DISTINCT') { throw syntaxError('DISTINCT must appear immediately after SELECT', this.peek()); }
    this.expectKeyword('FROM');
    const from = this.parseTableReference('after FROM');
    const joins = [];
    let where = null;
    let groupBy = null;
    let having = null;
    let orderBy = null;
    let limit = null;

    while (
      (this.peek().type === 'KEYWORD' && this.peek().upperValue === 'JOIN') ||
      (this.peek().type === 'KEYWORD' && ['INNER', 'LEFT'].includes(this.peek().upperValue))
    ) {
      joins.push(this.parseJoin());
    }
    if (this.matchKeyword('WHERE')) {
      if (['EOF', 'SEMICOLON'].includes(this.peek().type)) { throw syntaxError('WHERE is missing an expression', this.peek()); }
      where = this.parseOrExpression('WHERE', false);
    }
    if (this.matchKeyword('GROUP')) {
      this.expectKeyword('BY');
      if (['EOF', 'SEMICOLON'].includes(this.peek().type)) { throw syntaxError('GROUP BY is missing one or more columns', this.peek()); }
      groupBy = { type: 'GroupByClause', columns: this.parseIdentifierList('GROUP BY') };
    }
    if (this.matchKeyword('HAVING')) {
      if (['EOF', 'SEMICOLON'].includes(this.peek().type)) { throw syntaxError('HAVING is missing an expression', this.peek()); }
      having = this.parseOrExpression('HAVING', true);
    }
    if (this.matchKeyword('ORDER')) {
      this.expectKeyword('BY');
      orderBy = { type: 'OrderByClause', expression: this.parseValueExpression('ORDER BY'), direction: 'ASC' };
      if (this.matchKeyword('ASC')) { orderBy.direction = 'ASC'; }
      else if (this.matchKeyword('DESC')) { orderBy.direction = 'DESC'; }
    }
    if (this.matchKeyword('LIMIT')) { limit = this.parseLimit(); }

    this.matchType('SEMICOLON');
    if (this.peek().type !== 'EOF') {
      const token = this.peek();
      const nearby = token.upperValue || token.value;
      if (token.type === 'RIGHT_PAREN') { throw syntaxError('unexpected closing parenthesis', token); }
      if (nearby === 'DISTINCT') { throw syntaxError('DISTINCT must appear immediately after SELECT', token); }
      throw new Error('Unsupported SQL syntax near "' + nearby + '". Version 1.1 supports one SELECT, INSERT, UPDATE, DELETE, or transaction-control statement at a time.');
    }
    return {
      type: 'SelectQuery', select: selection, distinct: distinct, from: from, joins: joins,
      where: where, groupBy: groupBy, having: having, orderBy: orderBy, limit: limit
    };
  };

  function parseQuery(query) {
    if (!String(query || '').trim()) { throw new Error('Please enter a SQL query first.'); }
    return new Parser(tokenize(query)).parseQuery();
  }

  function parseStatement(sql) {
    if (!String(sql || '').trim()) { throw new Error('Please enter a SQL statement first.'); }
    const parser = new Parser(tokenize(sql));
    const first = parser.peek();
    if (first.type !== 'KEYWORD') { throw syntaxError('expected a supported SQL statement', first); }
    if (first.upperValue === 'SELECT') { return parser.parseQuery(); }
    if (first.upperValue === 'INSERT') { return parser.parseInsertStatement(); }
    if (first.upperValue === 'UPDATE') { return parser.parseUpdateStatement(); }
    if (first.upperValue === 'DELETE') { return parser.parseDeleteStatement(); }
    if (['BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT'].includes(first.upperValue)) { return parser.parseTransactionStatement(); }
    throw new Error('Unsupported SQL statement "' + first.value + '" in Version 1.1.');
  }

  global.SqlFlow = global.SqlFlow || {};
  global.SqlFlow.parser = { tokenize: tokenize, parseQuery: parseQuery, parseStatement: parseStatement };
})(typeof window !== 'undefined' ? window : globalThis);
