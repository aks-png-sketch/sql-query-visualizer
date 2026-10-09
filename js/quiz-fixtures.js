(function (global) {
  'use strict';
  const bank = global.SqlFlow.quizBank;
  function relation(columns, types, values) {
    return { columns: columns, schema: columns.map(function (name, index) { return { name: name, type: types[index] }; }), rows: values.map(function (tuple) { return Object.fromEntries(columns.map(function (name, index) { return [name, tuple[index]]; })); }) };
  }
  const datasets = {
    market: {
      customers: relation(['cid','name','region'],['INTEGER','TEXT','TEXT'],[[1,'Ava','North'],[2,'Eli','South'],[3,'Zoe','North'],[4,'Ivo','West']]),
      orders: relation(['oid','cid','amount','status'],['INTEGER','INTEGER','NUMBER','TEXT'],[[10,1,40,'paid'],[11,1,60,'open'],[12,2,null,'paid'],[13,2,0,'cancelled'],[14,3,80,'paid'],[15,null,25,'open']]),
      payments: relation(['pid','oid','amount'],['INTEGER','INTEGER','NUMBER'],[[100,10,40],[101,11,20],[102,11,40],[103,999,10]]),
      products: relation(['sku','category','price'],['TEXT','TEXT','NUMBER'],[['A','book',12],['B','book',12],['C','game',30],['D','game',null],['E','pen',0]])
    },
    library: {
      books: relation(['bid','title','shelf','cost'],['INTEGER','TEXT','TEXT','NUMBER'],[[1,'Atlas','Ref',20],[2,'Boreal','Fiction',10],[3,'Cedar','Fiction',null],[4,'Delta','Ref',30]]),
      loans: relation(['lid','bid','mid','returned'],['INTEGER','INTEGER','INTEGER','TEXT'],[[10,1,1,'yes'],[11,1,2,'no'],[12,2,1,'no'],[13,3,null,'yes']]),
      members: relation(['mid','name','tier'],['INTEGER','TEXT','TEXT'],[[1,'Uma','Gold'],[2,'Vik','Silver'],[3,'Wen','Gold']]),
      reservations: relation(['rid','bid'],['INTEGER','INTEGER'],[])
    },
    clinic: {
      visits: relation(['id','ward','minutes','priority'],['INTEGER','TEXT','NUMBER','TEXT'],[[1,'East',10,'urgent'],[2,'East',20,'normal'],[3,'West',null,'normal'],[4,'West',30,'urgent'],[5,'West',0,'normal'],[6,'East',10,'urgent']]),
      staff: relation(['sid','ward','role'],['INTEGER','TEXT','TEXT'],[[1,'East','nurse'],[2,'East','doctor'],[3,'West','nurse'],[4,'North','doctor']])
    },
    workshop: {
      jobs: relation(['id','machine','seconds','passed'],['INTEGER','TEXT','NUMBER','TEXT'],[[1,'M1',5,'yes'],[2,'M2',0,'no'],[3,'M1',15,'no'],[4,'M3',null,'yes'],[5,'M2',5,'yes']]),
      tags: relation(['tid','job_id','label'],['INTEGER','INTEGER','TEXT'],[[1,1,'red'],[2,1,'blue'],[3,3,'red'],[4,99,'orphan']])
    }
  };
  const legacyFixture = bank.fixture;
  bank.datasets = datasets;
  bank.fixture = function (id) {
    if (!id || id === 'default') { return legacyFixture(); }
    if (!Object.prototype.hasOwnProperty.call(datasets, id)) { throw new Error('Unknown quiz dataset: ' + id); }
    const tables = JSON.parse(JSON.stringify(datasets[id]));
    return { tables: tables, resolveTable: function (name) { const key = String(name).toLowerCase(); if (!Object.prototype.hasOwnProperty.call(tables,key)) { throw new Error('Table not found: ' + name); } return Object.assign({name:key},tables[key]); } };
  };
})(typeof window !== 'undefined' ? window : globalThis);
