(function (global) {
  'use strict';
  const items = [
    ['A. Silberschatz, H. F. Korth, S. Sudarshan', 'Database System Concepts, 7th ed.', '2019', 'McGraw-Hill', 'https://www.yale.db-book.com/', 'Background: relational algebra, normalization, transactions, and database design.'],
    ['R. Elmasri, S. B. Navathe', 'Fundamentals of Database Systems, 7th ed.', '2015', 'Pearson', 'https://www.pearson.com/en-us/subject-catalog/p/redirected-product/P200000003546/9780133970777', 'Background: DBMS fundamentals and relational schema design.'],
    ['P. G. Selinger et al.', 'Access Path Selection in a Relational Database Management System', '1979', 'ACM SIGMOD; DOI 10.1145/582095.582099', 'https://doi.org/10.1145/582095.582099', 'Research background on cost-based access-path selection; SQLFlow does not implement this optimizer.'],
    ['G. Graefe', 'Query Evaluation Techniques for Large Databases', '1993', 'ACM Computing Surveys 25(2); DOI 10.1145/152610.152611', 'https://doi.org/10.1145/152610.152611', 'Research background on physical query execution methods; SQLFlow shows logical stages instead.'],
    ['A. Leventidis, J. Zhang, C. Dunne, W. Gatterbauer, H. V. Jagadish, M. Riedewald', 'QueryVis: Logic-based diagrams help users understand complicated SQL queries faster', '2020', 'arXiv:2004.11375', 'https://arxiv.org/abs/2004.11375', 'Related SQL-visualization research; not an implementation claim.'],
    ['PostgreSQL Global Development Group', 'PostgreSQL 18: Querying a Table', '2026', 'Official PostgreSQL documentation', 'https://www.postgresql.org/docs/18/tutorial-select.html', 'Implementation cross-check for SQL SELECT, WHERE, ORDER BY, and DISTINCT concepts.'],
    ['PostgreSQL Global Development Group', 'PostgreSQL 18: Aggregate Functions', '2026', 'Official PostgreSQL documentation', 'https://www.postgresql.org/docs/18/functions-aggregate.html', 'Implementation cross-check for COUNT, SUM, AVG, and NULL handling.'],
    ['PostgreSQL Global Development Group', 'PostgreSQL 18: Transaction Isolation', '2026', 'Official PostgreSQL documentation', 'https://www.postgresql.org/docs/18/transaction-iso.html', 'Background on isolation and concurrency; SQLFlow does not simulate concurrent sessions.'],
    ['PostgreSQL Global Development Group', 'PostgreSQL 18: Indexes', '2026', 'Official PostgreSQL documentation', 'https://www.postgresql.org/docs/18/indexes.html', 'Background on index choices; SQLFlow does not model physical indexes.'],
    ['IIT Roorkee', 'GATE 2025 Master Question Papers and Answer Keys', '2025', 'Official GATE examination resource', 'https://gate2025.iitr.ac.in/question-papers.html', 'Exam-format reference only; SQLFlow questions are original practice, not copied historical items.'],
    ['IIT Guwahati', 'GATE 2026 Master Question Papers and Answer Keys', '2026', 'Official GATE examination resource', 'https://gate2026.iitg.ac.in/QPs-answer-keys.html', 'Exam-format reference only; no claim that practice items appeared in GATE.']
  ];
  const host = global.document.getElementById('referencesList');
  if (host) items.forEach(function (ref) {
    const card = global.document.createElement('article'); card.className = 'competitive-card';
    const title = global.document.createElement('h4'); const link = global.document.createElement('a'); link.href = ref[4]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = ref[1]; title.appendChild(link); card.appendChild(title);
    const citation = global.document.createElement('p'); citation.textContent = ref[0] + ' (' + ref[2] + '). ' + ref[3] + '.'; card.appendChild(citation);
    const relevance = global.document.createElement('p'); relevance.textContent = ref[5]; card.appendChild(relevance); host.appendChild(card);
  });
  global.SqlFlow.references = items;
})(typeof window !== 'undefined' ? window : globalThis);
