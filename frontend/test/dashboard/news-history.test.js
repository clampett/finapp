const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { buildSync } = require('../../landing/node_modules/esbuild');

function load(relative, extra = {}) {
  const context = { module: { exports: {} }, URL, crypto:webcrypto,
    localStorage: { values:new Map(), getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,value);} },
    sessionStorage: {getItem:()=> 'session-fixture'}, ...extra };
  vm.runInNewContext(buildSync({entryPoints:[path.join(__dirname,'../../dashboard/src',relative)],bundle:true,write:false,format:'cjs',platform:'node',define:{'import.meta.env.VITE_API_URL':'""'}}).outputFiles[0].text,context);
  return { api:context.module.exports, context };
}
function forecast() {
  return { status:'success', model_version:3, inputs:{years:1,sim_type:'monte_carlo',inflation_rate:0,nodes:[{id:'cash',balance:100}]},
    monte_carlo:[{year:0,p10:100,p50:100,p90:100,reference:100},{year:1,p10:-20,p50:150,p90:200,reference:110}], assumptions:['Hypothetical forecast'] };
}

test('saved demo runs survived reloads, retained original inputs, and isolated profiles', async()=>{
  const {api,context} = load('history/run-store.ts');
  const owner={userId:2,demo:true}, result=forecast();
  const saved=await api.saveRun(owner,'First perspective','monte_carlo',result);
  result.inputs.nodes[0].balance=999;
  result.monte_carlo[1].p50=999;
  const reopened=await api.getRun(owner,saved.summary.id);
  assert.equal(reopened.inputs.nodes[0].balance,100);
  assert.equal(reopened.result.monte_carlo[1].p50,150);
  assert.equal((await api.listRuns({userId:1,demo:true})).total,0);
  const reloaded=load('history/run-store.ts',{localStorage:context.localStorage}).api;
  assert.equal((await reloaded.listRuns(owner)).total,1);
  await api.renameRun(owner,saved.summary.id,'Renamed');
  assert.equal((await api.getRun(owner,saved.summary.id)).summary.title,'Renamed');
  await api.deleteRun(owner,saved.summary.id);
  assert.equal((await api.listRuns(owner)).total,0);
});

test('demo history enforced quotas, complete results, and storage failures',async()=>{
  const {api,context}=load('history/run-store.ts');
  const owner={userId:2,demo:true};
  for(let i=0;i<20;i++) await api.saveRun(owner,`Run ${i}`,'monte_carlo',forecast());
  await assert.rejects(api.saveRun(owner,'Overflow','monte_carlo',forecast()),/20 runs/);
  const broken=forecast();broken.monte_carlo.pop();
  await assert.rejects(api.saveRun(owner,'Incomplete','monte_carlo',broken),/complete forecast/);
  const other={userId:3,demo:true};
  context.localStorage.setItem=()=>{throw Error('quota');};
  await assert.rejects(api.saveRun(other,'Blocked','monte_carlo',forecast()),/storage is full/);
});

test('private history used authenticated requests and never silently fell back to demo storage',async()=>{
  const calls=[];
  const {api}=load('history/run-store.ts',{fetch:async(url,options)=>{calls.push({url,options});return{ok:false,status:401,json:async()=>({})};}});
  await assert.rejects(api.listRuns({userId:9,demo:false}),/session expired/);
  assert.equal(calls[0].url,'/api/v1/simulation-runs?page=0&size=12');
  assert.equal(calls[0].options.credentials,'include');
  assert.equal(calls[0].options.headers['X-FinApp-Session'],'session-fixture');
});

test('saved run validator rejected invalid year ordering, percentiles and unknown formats',async()=>{
  const {api}=load('history/run-store.ts');
  const run=await api.saveRun({userId:2,demo:true},'Valid','monte_carlo',forecast());
  assert.equal(api.validRun(run),true);
  run.result.monte_carlo[1].p10=500;
  assert.equal(api.validRun(run),false);
  run.result.monte_carlo[1].p10=-20;run.result.monte_carlo[1].year=9;
  assert.equal(api.validRun(run),false);
});

test('news links remained publisher-scoped and dates were presented without invented freshness',()=>{
  const {api}=load('news/news-model.ts');
  const article={id:'a'.repeat(24),title:'Markets today',url:'https://finance.yahoo.com/news/example',published_at:'2026-11-16T15:00:00Z',source_id:'yahoo',source:'Yahoo Finance',topic:'markets'};
  assert.equal(api.validArticle(article),true);
  for(const url of ['javascript:alert(1)','https://finance.yahoo.com.evil.example/a','https://user:pass@finance.yahoo.com/a','http://finance.yahoo.com/a']) assert.equal(api.validArticle({...article,url}),false);
  assert.equal(api.relativeDate(article.published_at,Date.parse('2026-11-16T16:00:00Z')),'1h ago');
  assert.equal(api.validArticle({...article,published_at:'bad date'}),false);
});
