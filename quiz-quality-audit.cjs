// Read-only audit. Transaction scenarios run in fresh VM realms with memory storage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const file of ['parser','executor','quiz-bank','quiz-fixtures','quiz-expansion','quiz-engine','simulation','quiz-audit'])require('./js/'+file+'.js');
const sqlflow=global.SqlFlow;
function realm(storage){const context=vm.createContext({localStorage:storage});for(const file of ['database','parser','executor','transactions'])vm.runInContext(fs.readFileSync(path.join(__dirname,'js',file+'.js'),'utf8'),context,{filename:file+'.js'});return context.SqlFlow;}
const report=sqlflow.quizAudit.audit();let transactions=0;
for(const question of sqlflow.quizBank.questions.filter(q=>q.transactionCase)){
  const values=new Map();let fail=false;const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(fail)throw new Error('Simulated persistence failure');values.set(key,value);}};
  let context=realm(storage);context.database.createCustomTable({tableName:'audit_accounts',columns:[{name:'id',type:'INTEGER'},{name:'balance',type:'NUMBER'}],rows:[{id:1,balance:100},{id:2,balance:50}]});const errors=[];const scenario=question.transactionCase;
  scenario.statements.forEach((statement,index)=>{if(question.commitStorageFailure&&index===scenario.statements.length-1)fail=true;try{context.transactions.execute(context.parser.parseStatement(statement));}catch(error){errors.push(error.message);}});
  if(question.reloadCase)context=realm(storage);
  const actual=context.transactions.getDatabaseView().resolveTable('audit_accounts').rows;
  if(JSON.stringify(actual)!==JSON.stringify(scenario.expected)||context.transactions.getState().active!==scenario.active)report.errors.push(question.id+': isolated transaction state mismatch');
  if(scenario.error&&!errors.some(error=>error.toLowerCase().includes(scenario.error.toLowerCase())))report.errors.push(question.id+': expected transaction error not observed');
  if(!scenario.error&&errors.length)report.errors.push(question.id+': unexpected transaction errors '+errors.join(';'));
  if(question.commitStorageFailure&&JSON.stringify(context.database.resolveTable('audit_accounts').rows)!==JSON.stringify([{id:1,balance:100},{id:2,balance:50}]))report.errors.push(question.id+': committed data was not restored');
  transactions++;
}
const revisions=sqlflow.quizBank.revisions;
report.transactionChecks=transactions;report.originalQuestions=102;report.added=sqlflow.quizBank.questions.length-102;report.revisedOriginalIds=new Set(revisions.map(item=>item.id)).size;report.difficultyCorrections=revisions.filter(item=>item.field==='difficulty').length;report.hintCorrections=revisions.filter(item=>item.field==='hint').length;
console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
