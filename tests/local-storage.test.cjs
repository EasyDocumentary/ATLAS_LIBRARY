const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.slice(html.indexOf('function normalizeName(name)'), html.indexOf('let activeThemes=new Set()'));
assert.ok(source.includes('function getChanges'));
const baseline = {FRA: [
 {id:'FRA-arte',name:'ARTE',type:'Publique',genres:'Culture',notes:'Ancienne note',buyer:'',themes:['Art & culture']},
 {id:'FRA-france5',name:'France 5',type:'Publique',themes:[]}
]};
const ctx = {NEW_CATALOG:baseline,THEMES:['Art & culture','Animalier & nature'],cleanThemes: x=>Array.isArray(x.themes)?x.themes:[],structuredClone,Date,console};
vm.createContext(ctx);
vm.runInContext(source, ctx);
const run = js => vm.runInContext(js, ctx);
run("data.FRA[0].name='ARTE MODIFIÉ';data.FRA[0].genres='';data.FRA[0].notes='';data.FRA[0].buyer='Mme Test';data.FRA[0].themes=['Animalier & nature'];data.FRA=data.FRA.filter(x=>x.id!=='FRA-france5');data.FRA.push({id:'custom-1',name:'Chaîne ajoutée',themes:[]})");
const changes = run('getChanges(data)');
assert.equal(changes.edits.FRA['FRA-arte'].genres, '');
assert.equal(changes.edits.FRA['FRA-arte'].notes, '');
assert.equal(changes.deleted.FRA[0], 'FRA-france5');
assert.equal(changes.additions.FRA.length, 1);
let restored = run('applyChanges(getChanges(data))');
assert.equal(restored.FRA.find(x=>x.id==='FRA-arte').name, 'ARTE MODIFIÉ');
assert.equal(restored.FRA.find(x=>x.id==='FRA-arte').buyer, 'Mme Test');
assert.ok(restored.FRA.some(x=>x.id==='custom-1'));
assert.ok(!restored.FRA.some(x=>x.id==='FRA-france5'));
run("BASE_CATALOG.FRA.push({id:'FRA-future',name:'Nouvelle chaîne référencée',themes:[]})");
restored = run('applyChanges('+JSON.stringify(changes)+')');
assert.ok(restored.FRA.some(x=>x.id==='FRA-future'));
assert.ok(!restored.FRA.some(x=>x.id==='FRA-france5'));
const legacy = {FRA:[{id:'FRA-arte',name:'ARTE renommée',genres:'',notes:'',buyer:'Ancien acheteur',themes:[]}]};
const migrated = run('migrateLegacy('+JSON.stringify(legacy)+')');
assert.equal(migrated.FRA.find(x=>x.id==='FRA-arte').buyer, 'Ancien acheteur');
assert.equal(migrated.FRA.find(x=>x.id==='FRA-arte').genres, '');
console.log('OK — edition, champs effaces, ajout/suppression, mise a jour catalogue, migration v1');
