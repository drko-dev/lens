// UI-04: real ARM64 Electron/Playwright hotbar geometry probe. QA only; no mutations to Kubernetes.
// Results are not release approval. Each assertion records PASS, FAIL or BLOCKED.
import { _electron as electron } from "playwright";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const candidate = path.join(root, "open-lens/dist-stage-uiux-hotbar-spacing-rebuild-20261028/mac-arm64/OpenLens DevOps.app");
const exe = path.join(candidate, "Contents/MacOS/OpenLens DevOps");
const sha = "8c47c07a4f3d323c859619f582fbca908a4a2b2b74599ad7e80b1facf7e92930";
const sourceKubeconfig = "/var/tmp/om-uiux-20261028/home/.kube/config";
const out = path.join(root, "open-lens/qa/2026-10-28/uiux-corrections/hotbar-spacing/evidence");
mkdirSync(out, { recursive: true });
const result = { candidate: path.relative(root,candidate), sha, status: "BLOCKED", tests:[], viewports:[], errors:[], profile:null, startedAt:new Date().toISOString() };
function record(name,status,details={}) { result.tests.push({name,status,...details}); console.log(status,name,JSON.stringify(details).slice(0,210)); }
function assertTest(name, pred, details={}) { record(name,pred?"PASS":"FAIL",details); }
function save() { writeFileSync(path.join(out,"ui04-playwright-visual-r4.json"),JSON.stringify(result,null,2)); }
function controlledError(e) {return String(e?.message ?? e).slice(0,360).replace(/\/Users\/gustavomarcon\/[^\s]+/g,"<redacted-path>");}
const poll=async(fn,ms)=>{const start=Date.now();while(Date.now()-start<ms){try{const r=await fn();if(r)return r;}catch{}await new Promise(ok=>setTimeout(ok,100));}return null;};
const fs = await import("node:fs");
let app;
let proc;
try {
 const hash=createHash("sha256").update(readFileSync(path.join(candidate,"Contents/Resources/app.asar"))).digest("hex");
 if(hash!==sha)throw Error("candidate SHA mismatch");
 const ps=execFileSync("/bin/ps",["-axo","pid=,command="],{encoding:"utf8"});
 const other=ps.split("\n").filter(line=>/OpenLens DevOps\.app\/Contents\/MacOS\/OpenLens DevOps/.test(line));
 if(other.length)throw Error("another OpenLens instance is running; no QA launch");
 const temp=mkdtempSync("/var/tmp/openlens-ui04-hotbar-");
 const home=path.join(temp,"home"),cicd=path.join(temp,"cicd"),kube=path.join(home,".kube/config");
 mkdirSync(path.dirname(kube),{recursive:true});mkdirSync(cicd,{recursive:true});
 copyFileSync(sourceKubeconfig,kube);
 const env={...process.env,HOME:home,CICD:cicd,KUBECONFIG:kube};
 const kubectl="/opt/homebrew/bin/kubectl";
 const current=execFileSync(kubectl,["config","current-context"],{env,encoding:"utf8"}).trim();
 const server=execFileSync(kubectl,["config","view","--minify","-o","jsonpath={.clusters[0].cluster.server}"],{env,encoding:"utf8"}).trim();
 if(current!=="qa"||server!=="https://localhost:49546") throw Error("wrong QA kubeconfig context or server");
 const ready=execFileSync(kubectl,["--request-timeout=5s","get","--raw=/readyz"],{env,encoding:"utf8"}).trim();
 if(ready!=="ok")throw Error("QA API not ready");
 record("QA-PREFLIGHT","PASS",{context:current,server:"local-loopback",ready});
 app=await electron.launch({executablePath:exe,args:["--integration-testing"],env,timeout:100000});
 proc=app.process();result.pid=proc.pid;
 const paths=await app.evaluate(({app})=>({appData:app.getPath("appData"),userData:app.getPath("userData"),sessionData:app.getPath("sessionData")}));
 const isolated=Object.values(paths).every(val=>val===cicd||val.startsWith(cicd+path.sep));
 record("QA-PROFILE",isolated?"PASS":"FAIL",{isolated});
 if(!isolated)throw Error("Electron profile paths escaped CICD; stop");
 result.profile={isolated:true,root:"<temporary QA CICD>"};
 const window=await poll(()=>app.windows().find(p=>p.url().startsWith("https://lens.app")),60000);
 if(!window)throw Error("main window never loaded");
 window.setDefaultTimeout(10000);
 const errors=[];
 window.on("pageerror",e=>errors.push(String(e).slice(0,150)));
 await window.getByTestId("welcome-page").waitFor({timeout:20000});
 const homeCount=await window.getByTestId("home-button").count();
 assertTest("HB-01-top-home",homeCount===1,{count:homeCount});
 await window.getByTestId("welcome-open-catalog").click();
 await window.locator('div.TableCell >> text="qa"').first().click();
 const iframe=await window.waitForSelector('iframe[id^="cluster-frame"]',{timeout:60000});
 const frame=await iframe.contentFrame();
 if(!frame)throw Error("QA cluster iframe missing");
 await frame.getByTestId("cluster-sidebar").waitFor({timeout:90000});
 for(const [w,h] of [[1280,800],[900,620],[700,560]]){
   await app.evaluate(({BrowserWindow},size)=>{BrowserWindow.getAllWindows()[0]?.setSize(size[0],size[1]);},[w,h]);
   await window.waitForTimeout(350); // resize settle, never used to recover failed actions
   const outer=await window.evaluate(()=>{
     const R=(e)=>{if(!e)return null;const a=e.getBoundingClientRect();return {x:a.x,y:a.y,width:a.width,height:a.height,right:a.right,bottom:a.bottom};};
     const rail=document.querySelector(".HotbarMenu");
     const items=[...document.querySelectorAll(".HotbarMenu .HotbarCell")];
     const pins=items.filter(c=>!!c.querySelector("[data-rbd-draggable-id]"));
     const invisibleEmpty=items.filter(c=>!c.querySelector("[data-rbd-draggable-id]")).map(e=>({border:getComputedStyle(e).borderColor,box:R(e)}));
     return {rail:R(rail),pins:pins.map(R),pinCount:pins.length,iframe:R(document.querySelector('iframe[id^="cluster-frame"]')),documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,empty:invisibleEmpty,homeInRail:!!rail?.querySelector('[data-testid="home-button"]')};
   });
   const inner=await frame.evaluate(()=>{
     const R=(e)=>{if(!e)return null;const a=e.getBoundingClientRect();return {x:a.x,y:a.y,width:a.width,height:a.height,right:a.right,bottom:a.bottom};};
     return {sidebar:R(document.querySelector('[data-testid="cluster-nav-column"]')),content:R(document.querySelector('[data-testid="cluster-content-column"]'))};
   });
   const railGap=outer.rail&&outer.iframe?outer.iframe.x-outer.rail.right:null;
   const treeGap=inner.sidebar&&inner.content?inner.content.x-inner.sidebar.right:null;
   const pinGap=outer.pins.length>=2?outer.pins[1].y-outer.pins[0].bottom:null;
   const measured={requested:{w,h},outer,inner,railGap,treeGap,pinGap};
   result.viewports.push(measured);
   await window.screenshot({path:path.join(out,`hotbar-r4-${w}x${h}.png`)}).catch(e=>result.errors.push("screenshot:"+controlledError(e)));
   assertTest(`HB-02-rail-${w}`,outer.rail?.width>=68&&outer.rail?.width<=76,{width:outer.rail?.width});
   assertTest(`HB-03-rail-tree-${w}`,railGap>=(w>900?16:8),{gap:railGap});
   assertTest(`HB-04-tree-content-${w}`,treeGap>=(w>900?24:12),{gap:treeGap});
   assertTest(`HB-12-overflow-${w}`,!outer.documentOverflow);
   assertTest(`HB-01-rail-no-home-${w}`,!outer.homeInRail);
   if(outer.pins.length>=2){
     assertTest(`HB-02-pin-gap-${w}`,pinGap>=(w>900?12:8),{gap:pinGap,pins:outer.pins.length});
   }else record(`HB-02-pin-gap-${w}`,"BLOCKED",{reason:"need two QA pins",pins:outer.pins.length});
   const dotted=outer.empty.filter(e=>e.border!=="rgba(0, 0, 0, 0)"&&e.border!=="transparent");
   assertTest(`HB-06-empty-no-dots-${w}`,dotted.length===0,{empty:outer.empty.length});
 }
 const collapsed=window.getByTestId("hotbar-collapse");
 await collapsed.click();
 await window.getByTestId("hotbar-expand").waitFor({timeout:4000});
 await window.getByTestId("hotbar-expand").click();
 await collapsed.waitFor({timeout:4000});
 record("HB-09-collapse-expand","PASS");
 const route=()=>frame.evaluate(()=>location.pathname);
 let routesOkay=true;
 for(let cycle=0;cycle<3;cycle++){
   for(const id of ["nodes","pods","deployments"]){
     try{
       const child=frame.getByTestId("sidebar-item-link-for-"+id);
       if(await child.count()===0){
         const parent=id==="nodes"?"cluster":"workloads";
         await frame.getByTestId("sidebar-item-link-for-"+parent).click();
       }
       await child.click();
       const good=await poll(async()=>await route()==="/"+id,5000);
       if(!good)routesOkay=false;
     }catch(e){routesOkay=false;result.errors.push("navigation:"+id+":"+controlledError(e));}
   }
 }
 assertTest("HB-14-navigation-3cycles",routesOkay);
 await window.getByTestId("home-button").click();
 const welcomeAfterHome=await poll(async()=>await window.getByTestId("welcome-page").count()===1,7000);
 assertTest("HB-01-home-first-click",Boolean(welcomeAfterHome));
 const pinCount=result.viewports[0]?.outer?.pinCount ?? 0;
 for(const [name,n] of [["HB-07-switch-clusters",2],["HB-10-reorder",2],["HB-11-long-scroll",25],["HB-11-extra-long-scroll",35]]){
  if(pinCount<n)record(name,"BLOCKED",{reason:`QA profile has only ${pinCount} pinned entities; need ${n}`});
  else record(name,"BLOCKED",{reason:"requires independent drag/switch and persistence fixtures, not inferred from geometry"});
 }
 record("HB-15-terminal-reconnect","BLOCKED",{reason:"out of UI-only geometry probe; explicit offline test remains separate"});
 result.errors.push(...errors);
 result.status=result.tests.some(t=>t.status==="FAIL")?"FAIL":result.tests.some(t=>t.status==="BLOCKED")?"PARTIAL_BLOCKED":"PASS";
} catch(e){result.errors.push(controlledError(e));result.status="BLOCKED";console.error("QA_BLOCKED",controlledError(e));}
finally{
 if(app){try{await Promise.race([app.close(),new Promise((_,reject)=>setTimeout(()=>reject(Error("close timeout")),8000))]);}catch{try{proc?.kill("SIGTERM");}catch{}}}
 result.finishedAt=new Date().toISOString();
 save();console.log("SUMMARY",result.status,result.tests.reduce((a,t)=>(a[t.status]=(a[t.status]??0)+1,a),{}));
 if(result.status==="FAIL")process.exitCode=1;
}
