import {PULSE_MAX_MS,type OwnedKey} from '../core/broker';
// Fixed driver code, never supplied by the player. A second release timer lives
// in the renderer, so a stalled parent process cannot keep a key held there.
export function keyboardScript(key:OwnedKey,type:'keyDown'|'keyUp'){
 if(!['A','W','D'].includes(key)||!['keyDown','keyUp'].includes(type))throw Error('Invalid keyboard command');
 const code={A:65,W:87,D:68}[key];
 return `(()=>{const key=${JSON.stringify(key.toLowerCase())},code=${code},type=${JSON.stringify(type==='keyDown'?'keydown':'keyup')};
 if(!window.__wgLease){const timers=new Map();const emit=(k,n,t)=>document.dispatchEvent(new KeyboardEvent(t,{key:k,code:'Key'+k.toUpperCase(),keyCode:n,which:n,bubbles:true,cancelable:true}));
 const release=()=>{for(const [k,v] of timers){clearTimeout(v.timer);emit(k,v.code,'keyup');}timers.clear();};
 Object.defineProperty(window,'__wgLease',{value:{timers,emit,release}});addEventListener('pagehide',release);}
 const b=window.__wgLease;const old=b.timers.get(key);if(old)clearTimeout(old.timer);
 if(type==='keydown'){b.emit(key,code,type);b.timers.set(key,{code,timer:setTimeout(()=>{b.emit(key,code,'keyup');b.timers.delete(key);},${PULSE_MAX_MS})});}
 else{b.emit(key,code,type);b.timers.delete(key);}return Date.now();})()`;
}
