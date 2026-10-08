import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommandRequest } from '../lib/command-request.mjs';

test('overlapping commands are blocked and a failed operation retains its retry ID', () => {
  const request=createCommandRequest();
  const first=request.begin('sale');
  assert.ok(first);
  assert.equal(request.begin('sale'),null);
  assert.equal(request.begin('payment'),null);
  request.finish();
  assert.equal(request.begin('sale'),first);
  request.finish();
  assert.notEqual(request.begin('payment'),first);
  request.reset();
  assert.equal(request.begin('payment'),null);
  request.finish();
  const second=request.begin('payment');
  assert.ok(second);
  assert.notEqual(second,first);
});

test('browser snapshots respect saved theme, system preference, hash navigation and cleanup', async () => {
  const previous=Object.fromEntries(['window','document','location','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const target=new EventTarget();
  const media=new EventTarget();media.matches=true;
  const storage=new Map();
  Object.defineProperties(globalThis,{
    window:{configurable:true,value:Object.assign(target,{matchMedia:()=>media})},
    document:{configurable:true,value:{documentElement:{dataset:{}}}},
    location:{configurable:true,value:{hash:'#sales'}},
    localStorage:{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}},
  });
  try {
    const {readTheme,subscribeTheme,changeTheme,readView,subscribeView}=await import('../lib/browser-preferences.mjs');
    assert.equal(readTheme(),'dark');
    storage.set('nutrequine-theme','light');
    assert.equal(readTheme(),'light');
    let themes=0,views=0;
    const stopTheme=subscribeTheme(()=>themes++),stopView=subscribeView(()=>views++);
    changeTheme('dark');
    assert.equal(readTheme(),'dark');
    assert.equal(document.documentElement.dataset.theme,'dark');
    assert.equal(themes,1);
    storage.delete('nutrequine-theme');media.matches=false;media.dispatchEvent(new Event('change'));
    assert.equal(readTheme(),'light');
    assert.equal(themes,2);
    assert.equal(readView(),'sales');
    location.hash='#productions';window.dispatchEvent(new Event('hashchange'));
    assert.equal(readView(),'productions');assert.equal(views,1);
    stopTheme();stopView();
    window.dispatchEvent(new Event('hashchange'));window.dispatchEvent(new Event('storage'));
    assert.equal(views,1);assert.equal(themes,2);
    localStorage.setItem=()=>{throw new Error('Storage unavailable');};
    changeTheme('dark');assert.equal(readTheme(),'dark');
  } finally {
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});
