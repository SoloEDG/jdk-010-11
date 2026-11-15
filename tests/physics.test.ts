import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflect, refract } from '../src/features/optics/lib/refraction';
import { trace } from '../src/features/optics/lib/trace';
import { evaluateMission } from '../src/features/missions/lib/evaluate';
import { missions } from '../src/features/missions/model/presets';
import type { Element, LabDocument } from '../src/shared/document';
const el=(id:string,kind:Element['kind'],x:number,y:number,patch:Partial<Element>={}):Element=>({id,kind,x,y,angle:kind==='source'?0:90,size:180,power:1,rays:9,spread:0,wavelength:550,focal:180,index:1.52,...patch});
const preset=(id:string)=>structuredClone(missions.find(m=>m.id===id)!.doc);
const hitPower=(doc:LabDocument)=>trace(doc).hits.reduce((s,h)=>s+h.power,0);
test('reflection preserves norm and reverses the normal component',()=>{const r=reflect({x:1,y:0},{x:-1,y:0});assert.deepEqual(r,{x:-1,y:0});});
test('total internal reflection returns no transmitted direction',()=>assert.equal(refract({x:.8,y:.6},{x:0,y:-1},1.5,1),null));
test('parallel rays converge through a thin lens onto a screen',()=>{const r=trace({version:1,items:[{id:'s',kind:'source',x:100,y:300,angle:0,size:100,power:1,rays:9,spread:0,wavelength:550,focal:150,index:1.5},{id:'l',kind:'lens',x:400,y:300,angle:90,size:200,power:1,rays:9,spread:0,wavelength:550,focal:150,index:1.5},{id:'d',kind:'screen',x:550,y:300,angle:90,size:200,power:1,rays:9,spread:0,wavelength:550,focal:150,index:1.5}]});assert.equal(r.hits.length,9);assert.ok(r.hits.every(h=>Math.abs(h.position)<.01));});

// 任务判定：必须以实际到屏光线的经过记录为依据，场景中仅仅存在目标器件不算有效证据

test('refraction mission fails when the prism is dragged off the beam',()=>{
  const doc=preset('refraction');
  for(const e of doc.items){
    if(e.kind==='prism')e.y=80; // 拖离光束（光束在 y≈280）
    if(e.kind==='screen'){e.x=400;e.y=280;} // 接收屏移到光源正前方
  }
  const ev=evaluateMission('refraction',doc,trace(doc));
  assert.equal(ev.complete,false);
  assert.equal(ev.ratio,0); // 没有有效（经过棱镜）能量
  assert.match(ev.reason,/三棱镜/);
  assert.ok(hitPower(doc)>0.99); // 接收屏仍显示真实直射能量
});
test('refraction mission fails when the prism is deleted',()=>{
  const doc=preset('refraction');
  doc.items=doc.items.filter(e=>e.kind!=='prism');
  const ev=evaluateMission('refraction',doc,trace(doc));
  assert.equal(ev.complete,false);
  assert.match(ev.reason,/三棱镜/);
  assert.ok(hitPower(doc)>0.99);
});
test('refraction mission completes when refracted light reaches the screen',()=>{
  const doc=preset('refraction');
  for(const e of doc.items)if(e.kind==='screen'){e.y=600;e.size=700;} // 屏移到折射光束处
  const ev=evaluateMission('refraction',doc,trace(doc));
  assert.ok(ev.ratio>=0.6); // 阈值保持 60%
  assert.equal(ev.complete,true);
});
test('light entering the prism, totally reflected inside and exiting another face counts as passing through',()=>{
  // 光源对准棱镜左侧面下部：光线进入棱镜后在底面全反射，再从右侧面出射
  const doc:LabDocument={version:1,items:[
    el('s','source',130,340,{size:20,rays:5}),
    el('p','prism',490,300,{angle:-90,size:170}),
    el('d','screen',800,340,{size:160}),
  ]};
  const r=trace(doc);
  assert.ok(r.segments.some(s=>Math.abs(s.to.y-355.25)<0.01)); // 确实在底面发生全反射
  const ev=evaluateMission('refraction',doc,r);
  assert.ok(ev.ratio>0.9);
  assert.equal(ev.complete,true);
});
test('crossing beams cannot borrow passage records from each other',()=>{
  // 光束 1 经过棱镜但不达屏；光束 2 直射到屏，两条光路在屏前相交
  const doc:LabDocument={version:1,items:[
    el('s1','source',130,280,{size:45}),
    el('p','prism',490,300,{angle:-90,size:170}),
    el('s2','source',100,560,{size:30,rays:5}),
    el('d','screen',900,560,{size:100}),
  ]};
  const r=trace(doc);
  const ev=evaluateMission('refraction',doc,r);
  assert.equal(ev.complete,false);
  assert.equal(ev.ratio,0); // 到屏光线都没有经过棱镜
  assert.ok(r.hits.reduce((s,h)=>s+h.power,0)>0.99); // 探测器仍看到真实直射能量
});
test('valid energy aggregates only the hits whose own path passed the target device',()=>{
  // 宽光束：9 条光线中 3 条穿过棱镜（含 1 条全反射路径），3 条直射到屏，3 条落空
  const doc:LabDocument={version:1,items:[
    el('s','source',130,280,{size:400}),
    el('p','prism',490,300,{angle:-90,size:170}),
    el('d','screen',800,600,{size:800}),
  ]};
  const r=trace(doc);
  const ev=evaluateMission('refraction',doc,r);
  assert.ok(Math.abs(ev.ratio-3*0.9216/9)<0.01); // 有效能量只汇总经过棱镜的命中
  assert.equal(ev.complete,false);
  assert.ok(Math.abs(r.hits.reduce((s,h)=>s+h.power,0)-(3*0.9216+3)/9)<0.01); // 屏上总能量含直射
});
test('reflection mission fails when the mirror is deleted and the screen catches direct light',()=>{
  const doc=preset('reflection');
  doc.items=doc.items.filter(e=>e.kind!=='mirror');
  for(const e of doc.items)if(e.kind==='screen'){e.x=400;e.y=370;e.angle=90;}
  const ev=evaluateMission('reflection',doc,trace(doc));
  assert.equal(ev.complete,false);
  assert.match(ev.reason,/平面镜/);
  assert.ok(hitPower(doc)>0.99);
});
test('reflection mission completes when mirror deflects the beam onto the screen',()=>{
  const doc:LabDocument={version:1,items:[
    el('s','source',150,300,{size:60}),
    el('m','mirror',500,300,{angle:-45}),
    el('d','screen',500,100,{angle:0,size:400}),
  ]};
  const ev=evaluateMission('reflection',doc,trace(doc));
  assert.ok(ev.ratio>=0.8); // 阈值保持 80%
  assert.equal(ev.complete,true);
});
test('focus mission fails without the lens even if direct light forms a tight spot',()=>{
  const doc:LabDocument={version:1,items:[
    el('s','source',100,300,{size:1,rays:1}),
    el('d','screen',550,300,{size:200}),
  ]};
  const ev=evaluateMission('focus',doc,trace(doc));
  assert.equal(ev.complete,false); // 旧逻辑 ratio=1、rms=0 会误判完成
  assert.match(ev.reason,/凸透镜/);
});
test('focus mission completes when lens focuses the beam onto the screen',()=>{
  const doc:LabDocument={version:1,items:[
    el('s','source',100,300,{size:100}),
    el('l','lens',400,300,{size:200,focal:150}),
    el('d','screen',550,300,{size:200}),
  ]};
  const ev=evaluateMission('focus',doc,trace(doc));
  assert.ok(ev.ratio>=0.8&&ev.rms<=3); // 阈值保持 80% / 3 mm
  assert.equal(ev.complete,true);
});
