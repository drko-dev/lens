"use strict";
const { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync }=require("node:fs");
const {tmpdir}=require("node:os");
const path=require("node:path");
const crypto=require("node:crypto");
const assert=require("node:assert/strict");
const {execFileSync}=require("node:child_process");
const ROOT="/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections";
const APP=path.join(ROOT,"open-lens/dist-stage-head-node20-20261029/mac-arm64/OpenLens DevOps.app");
const SHA="eabd34a19c49c6937d3e96d71201c72a2c144230c4f5969dc6a5d9afccb41924";
const PW=require(path.join(ROOT,"node_modules/playwright"));
const result={name:"HEAD-offline-isolated-Electron-smoke",sha:SHA,status:"FAIL",checkpoints:{},viewports:[],notes:[]};
let electronApp,qaRoot;
(async()=>{
 const hash=crypto.createHash("sha256").update(readFileSync(path.join(APP,"Contents/Resources/app.asar"))).digest("hex");
 assert.equal(hash,SHA);
 const ps=execFileSync("/bin/ps",["-axo","command="],{encoding:"utf8"});
 assert(!ps.split("\n").some(x=>x.includes(APP+"/Contents/MacOS/OpenLens DevOps")),"Candidate already running");
 qaRoot=mkdtempSync(path.join(tmpdir(),"lens-head-offline-smoke-"));
 const home=path.join(qaRoot,"home"),cicd=path.join(qaRoot,"cicd"),kc=path.join(home,".kube","config");
 mkdirSync(path.dirname(kc),{recursive:true});mkdirSync(cicd,{recursive:true});
 writeFileSync(kc,"apiVersion: v1\nkind: Config\npreferences: {}\nclusters: []\nusers: []\ncontexts: []\ncurrent-context: \"\"\n",{mode:0o600});
 // Seed an old Welcome pin, which should be migrated away without disturbing Home in top bar
 const appData=path.join(cicd,"OpenLens DevOps");mkdirSync(appData,{recursive:true});
 writeFileSync(path.join(appData,"lens-hotbar-store.json"),JSON.stringify({
   hotbars:[{id:"qa-offline",name:"Default",items:[{entity:{uid:"welcome-page-entity",name:"Welcome Page",source:"app"}},...Array(11).fill(null)]}],
   activeHotbarId:"qa-offline",__internal__:{migrations:{version:"6.4.1"}}
 },null,2));
 const env={...process.env,HOME:home,CICD:cicd,KUBECONFIG:kc,USER:"lens-qa-only",LOGNAME:"lens-qa-only",PS1:"lens-qa$",PROMPT:"lens-qa%"};
 result.profile="temp HOME + CICD + kubeconfig with ZERO clusters";
 electronApp=await PW._electron.launch({
    executablePath:path.join(APP,"Contents/MacOS/OpenLens DevOps"),
    args:["--integration-testing"],
    env,timeout:90000,
 });
 const dirs=await electronApp.evaluate(({app})=>({
    userData:app.getPath("userData"),sessionData:app.getPath("sessionData"),appData:app.getPath("appData")
 }));
 assert(Object.values(dirs).every(v=>v===cicd||v.startsWith(cicd+path.sep)), "PROFILE_ESCAPE");
 result.checkpoints.profileIsolation="PASS";
 let page;
 const end=Date.now()+65000;
 while(Date.now()<end) {
   page=electronApp.windows().find(x=>x.url().startsWith("https://lens.app"));
   if(page)break;
   await new Promise(r=>setTimeout(r,400));
 }
 if(!page)throw Error("Electron renderer window did not initialize, urls: "+electronApp.windows().map(x=>x.url()).join(","));
 page.setDefaultTimeout(20000);
 await page.getByTestId("welcome-page").waitFor({timeout:45000});
 result.checkpoints.welcomeLoaded="PASS";
 const topHome=page.getByTestId("home-button");
 assert.equal(await topHome.count(),1,"Top Home button count not 1");
 result.checkpoints.topHomeExactlyOne="PASS";
 const legacy=page.locator("#hotbarIcon-welcome-page-entity");
 assert.equal(await legacy.count(),0,"Deprecated lateral Home pin still visible");
 result.checkpoints.legacyLateralHomeRemoved="PASS";
 await topHome.click();
 await page.getByTestId("welcome-page").waitFor();
 result.checkpoints.homeClickNavigatesWelcome="PASS";
 for(const [width,height] of [[1280,800],[900,620],[700,560]]) {
  await page.setViewportSize({width,height});
  await page.waitForTimeout(350);
  const m=await page.evaluate(()=>({
   docWidth:document.documentElement.scrollWidth,
   clientWidth:document.documentElement.clientWidth,
   hotbarRail:(()=>{const e=document.querySelector('[data-testid="hotbar-rail"]');if(!e)return null;const b=e.getBoundingClientRect();return{x:b.x,width:b.width,height:b.height};})(),
   legacyHomeCount:document.querySelectorAll("#hotbarIcon-welcome-page-entity").length,
   topHomeCount:document.querySelectorAll('[data-testid="home-button"]').length,
  }));
  assert.equal(m.legacyHomeCount,0);
  assert.equal(m.topHomeCount,1);
  assert(m.docWidth<=m.clientWidth+2,"Horizontal overflow at "+width+"x"+height+": "+JSON.stringify(m));
  result.viewports.push({width,height,...m,status:"PASS"});
 }
 result.status="PARTIAL_PASS";
 result.notes.push("No real Kubernetes or pinned cluster was instantiated; cannot validate K8s badge, 25/35 pins, PROD indicator, terminal reconnection, or all UI-04.");
})().catch(e=>{
 result.error=String(e.stack||e.message||e).replaceAll(ROOT,"<repo>").replaceAll(qaRoot||"unlikely-qa-path","<qa>");
}).finally(async()=>{
 try{if(electronApp)await electronApp.close();}catch(e){result.notes.push("closeAppError:"+String(e.message).slice(0,170));}
 try{if(qaRoot)rmSync(qaRoot,{recursive:true,force:true});}catch(e){result.notes.push("temporaryProfileCleanupError:"+e.message);}
 const out="/var/tmp/lens-head-node20-offline-smoke-20261029.json";
 writeFileSync(out,JSON.stringify(result,null,2));
 console.log("SMOKE_RESULT",JSON.stringify(result));
 console.log("SMOKE_FILE",out);
 process.exitCode=(result.status==="PARTIAL_PASS"?0:1);
});
