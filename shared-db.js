/* ATLAS LIBRARY — collaborative Supabase database. SQL RLS is the security boundary. */
(function(){
"use strict";
const cfg=window.ATLAS_CONFIG||{},enabled=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||"")&&typeof cfg.publishableKey==="string"&&cfg.publishableKey.length>10;
let db=null,member=null,callbacks={},ready=false,subscription=null,refreshTimer=null;
const el=id=>document.getElementById(id),notify=t=>callbacks.notify?.(t);
function authUI(){
 let gate=el("atlasAuthGate");if(gate)return gate;
 const style=document.createElement("style");
 style.textContent=[
 ".atlas-auth-gate{position:fixed;inset:0;z-index:250;display:flex;align-items:center;justify-content:center;background:#030a14f7;padding:20px;color:#f0f8ff;font:14px system-ui}",
 ".atlas-auth-gate[hidden]{display:none!important}.atlas-auth-card{width:min(430px,100%);border:1px solid #355369;border-radius:20px;background:#0d2033;padding:32px;box-shadow:0 30px 90px #0009}",
 ".atlas-auth-card h2{font-size:26px;margin:0 0 8px}.atlas-auth-card p{color:#aac5d4}.atlas-auth-card label{display:block;margin:13px 0 5px;font-size:12px}",
 ".atlas-auth-card input{width:100%;padding:12px;background:#122a40;border:1px solid #31566b;border-radius:10px;color:white}.atlas-auth-card button{width:100%;margin-top:18px;padding:12px;background:#6de2bf;color:#052a26;border:0;border-radius:10px;font-weight:800;cursor:pointer}",
 ".atlas-auth-message{min-height:20px;color:#ffbfa8;margin-top:12px;font-size:12px}.atlas-shared-tools{padding:8px 14px;border-top:1px solid #29445b;display:flex;flex-wrap:wrap;gap:7px;align-items:center;background:#09202c;color:#b9d7e4;font-size:11px}",
 ".atlas-shared-tools button{padding:7px 9px;color:#d5edf4;border:1px solid #33546a;background:#173246;border-radius:8px;cursor:pointer}"
 ].join("\n");
 document.head.appendChild(style);
 gate=document.createElement("section");gate.id="atlasAuthGate";gate.className="atlas-auth-gate";
 gate.innerHTML='<div class="atlas-auth-card"><h2>ATLAS LIBRARY</h2><p>Accès réservé aux membres de l’équipe de ventes.</p><form id="atlasAuthForm"><label for="atlasEmail">E-mail professionnel</label><input type="email" id="atlasEmail" autocomplete="username" required><label for="atlasPassword">Mot de passe</label><input type="password" id="atlasPassword" autocomplete="current-password" required><button type="submit" id="atlasLoginButton">Se connecter</button></form><div role="alert" class="atlas-auth-message" id="atlasAuthMessage"></div></div>';
 document.body.appendChild(gate);
 el("atlasAuthForm").addEventListener("submit",async e=>{e.preventDefault();const button=el("atlasLoginButton");button.disabled=true;
  try{const {error}=await db.auth.signInWithPassword({email:el("atlasEmail").value.trim(),password:el("atlasPassword").value});if(error)throw error;await authorize()}
  catch(error){el("atlasAuthMessage").textContent="Connexion impossible : "+String(error.message||error)}
  finally{el("atlasPassword").value="";button.disabled=false}
 });
 return gate;
}
function lock(message=""){ready=false;authUI().hidden=false;el("atlasAuthMessage").textContent=message}
function loadSdk(){if(window.supabase?.createClient)return Promise.resolve();return new Promise((resolve,reject)=>{const tag=document.createElement("script");tag.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";tag.onload=()=>window.supabase?.createClient?resolve():reject(new Error("Module Supabase indisponible"));tag.onerror=()=>reject(new Error("Internet nécessaire pour la base partagée"));document.head.appendChild(tag)})}
async function readAll(){
 const result={};for(let from=0;;from+=500){const {data,error}=await db.from("atlas_channels").select("country_code,record_id,payload").order("country_code").order("record_id").range(from,from+499);if(error)throw error;
 for(const row of data||[])(result[row.country_code]||=[]).push({...row.payload,id:row.record_id});if((data||[]).length<500)break}return result
}
async function refresh(){if(!ready)return;callbacks.onData?.(await readAll())}
function sync(){if(subscription)db.removeChannel(subscription);subscription=db.channel("atlas-library-live").on("postgres_changes",{event:"*",schema:"public",table:"atlas_channels"},()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh().catch(e=>notify(e.message)),350)}).subscribe()}
function text(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toolbar(){
 let box=el("atlasSharedToolbar");if(!box){box=document.createElement("div");box.id="atlasSharedToolbar";box.className="atlas-shared-tools";document.querySelector(".sidebar")?.appendChild(box)}
 box.innerHTML="<strong>☁ Base partagée · "+text(member.display_name)+" ("+text(member.role)+")</strong>"+'<button id="atlasReload">Actualiser</button>'+(member.role==="admin"?'<button id="atlasSeed">Importer le catalogue</button><button id="atlasImportLocal">Importer données locales</button>':"")+'<button id="atlasLogout">Déconnexion</button>';
 el("atlasReload").onclick=()=>refresh().then(()=>notify("Base actualisée")).catch(e=>alert(e.message));
 el("atlasLogout").onclick=async()=>{await db.auth.signOut();logout()};
 if(member.role==="admin"){
  el("atlasSeed").onclick=async()=>{if(!confirm("Importer les diffuseurs du catalogue sans écraser les fiches existantes ?"))return;try{await importRecords(callbacks.catalog,true);await refresh();notify("Catalogue importé")}catch(e){alert(e.message)}};
  el("atlasImportLocal").onclick=async()=>{if(!confirm("Transférer les modifications de CE navigateur à la base commune ? Faites une sauvegarde JSON auparavant."))return;try{await importRecords(callbacks.localSnapshot,false);await refresh();notify("Données locales importées")}catch(e){alert(e.message)}};
 }
}
function logout(){ready=false;member=null;if(subscription){db.removeChannel(subscription);subscription=null}lock("Vous êtes déconnecté.");if(el("atlasSharedToolbar"))el("atlasSharedToolbar").innerHTML="";callbacks.onLogout?.()}
async function authorize(){
 const {data:{user},error}=await db.auth.getUser();if(error||!user){lock("Connectez-vous pour accéder aux données.");return}
 const {data:m,error:memberError}=await db.from("atlas_team_members").select("user_id,email,display_name,role,active").eq("user_id",user.id).maybeSingle();if(memberError)throw memberError;
 if(!m?.active){lock("Compte non autorisé : demandez votre accès à l’administrateur.");return}
 member=m;const records=await readAll();ready=true;callbacks.onData?.(records);authUI().hidden=true;toolbar();sync();notify("Base partagée connectée");callbacks.onAuthorized?.()
}
async function start(options){callbacks=options||{};if(!enabled)return false;lock("Connexion au serveur sécurisé…");try{await loadSdk();db=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});db.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")logout()});await authorize()}catch(e){lock("Initialisation impossible : "+String(e.message||e))}return true}
async function saveRecord(iso,item){if(!ready||!["admin","editor"].includes(member?.role))throw new Error("Modification non autorisée");const {error}=await db.from("atlas_channels").upsert({country_code:iso,record_id:item.id,payload:item},{onConflict:"country_code,record_id"});if(error)throw error}
async function deleteRecord(iso,id){if(!ready||member?.role!=="admin")throw new Error("Suppression réservée aux administrateurs");const {error}=await db.from("atlas_channels").delete().eq("country_code",iso).eq("record_id",id);if(error)throw error}
async function importRecords(records,onlyMissing=false){if(!ready||member?.role!=="admin")throw new Error("Import réservé à l’administrateur");let existing=new Set();if(onlyMissing){const current=await readAll();existing=new Set(Object.entries(current).flatMap(([code,rows])=>rows.map(row=>code+"|"+row.id)))}
 const all=Object.entries(records||{}).flatMap(([iso,rows])=>Array.isArray(rows)?rows.filter(x=>x?.id&&x.name).map(x=>({country_code:iso,record_id:x.id,payload:x})):[]);const rows=onlyMissing?all.filter(x=>!existing.has(x.country_code+"|"+x.record_id)):all;
 for(let i=0;i<rows.length;i+=100){const {error}=await db.from("atlas_channels").upsert(rows.slice(i,i+100),{onConflict:"country_code,record_id"});if(error)throw new Error("Import partiel "+i+"/"+rows.length+" : "+error.message)}return rows.length
}
window.ATLAS_SHARED={enabled,start,saveRecord,deleteRecord,importRecords,refresh,get ready(){return ready},get member(){return member}};
})();
