(function(){
"use strict";
var KEY="wolfLairPrivateAccess1",DB="wolfLairPrivateAccess",STORE="credentials";
var value="",remember=false,status="missing",revision=0,listeners=[],dbPromise=null,queue=Promise.resolve();
var hasDatabase=false,loaded=true;
try{hasDatabase=!!window.indexedDB;loaded=!hasDatabase;}catch(e){}
function valid(code){return typeof code==="string"&&code.trim().length>0&&code.trim().length<=480?code.trim():"";}
function readLocal(){try{return valid(localStorage.getItem(KEY));}catch(e){return "";}}
function writeLocal(code){
 try{if(code)localStorage.setItem(KEY,code);else localStorage.removeItem(KEY);return (localStorage.getItem(KEY)||"")===(code||"");}catch(e){return false;}
}
function state(){return {status:status,remember:remember,loading:!loaded};}
function notify(){listeners.forEach(function(fn){fn(state());});}
function database(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise(function(resolve){
  if(!hasDatabase){resolve(null);return;}
  var request,settled=false,timer;
  function finish(db){if(settled){if(db)db.close();return;}settled=true;clearTimeout(timer);resolve(db);}
  try{request=window.indexedDB.open(DB,1);}catch(e){finish(null);return;}
  timer=setTimeout(function(){finish(null);},2000);
  request.onupgradeneeded=function(){var db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
  request.onsuccess=function(){var db=request.result;db.onversionchange=function(){db.close();};finish(db);};
  request.onerror=request.onblocked=function(){finish(null);};
 });
 return dbPromise;
}
function readBackup(db){
 return new Promise(function(resolve){
  if(!db){resolve("");return;}
  var tx,request;
  try{tx=db.transaction(STORE,"readonly");request=tx.objectStore(STORE).get(KEY);}catch(e){resolve("");return;}
  request.onsuccess=function(){resolve(valid(request.result));};
  request.onerror=tx.onabort=function(){resolve("");};
 });
}
function writeBackup(db,code){
 return new Promise(function(resolve){
  if(!db){resolve(false);return;}
  var tx;
  try{tx=db.transaction(STORE,"readwrite");var store=tx.objectStore(STORE);if(code)store.put(code,KEY);else store.delete(KEY);}catch(e){resolve(false);return;}
  tx.oncomplete=function(){resolve(true);};tx.onabort=tx.onerror=function(){resolve(false);};
 });
}
function enqueue(operation){queue=queue.then(database).then(operation).catch(function(){return false;});return queue;}
function backup(code,serial,localSaved){
 enqueue(function(db){return writeBackup(db,code);}).then(function(saved){
  if(serial!==revision)return;
  status=value?(remember?(localSaved||saved?"saved":"visit"):"visit"):"missing";notify();
 });
}
function set(code,keep){
 code=valid(code);if(!code)return false;
 keep=keep!==false;
 if(value===code&&remember===keep&&(status==="saved"||status==="saving"||!keep))return true;
 value=code;remember=keep;revision++;
 var localSaved=writeLocal(keep?code:"");
 status=keep?(localSaved?"saved":hasDatabase?"saving":"visit"):"visit";
 notify();backup(keep?code:"",revision,localSaved&&keep);return true;
}
function get(){
 if(!value&&revision===0){var saved=readLocal();if(saved)set(saved,true);}
 return value;
}
function forget(){value="";remember=false;status="missing";revision++;writeLocal("");notify();backup("",revision,false);}
value=readLocal();if(value){remember=true;status="saved";loaded=true;}
var ready=enqueue(readBackup).then(function(saved){
 loaded=true;
 if(revision===0){
  if(!value&&valid(saved)){value=valid(saved);remember=true;status="saved";writeLocal(value);}
  else if(value)backup(value,revision,true);
 }
 notify();return get();
});
window.WolfPrivateAccess={get:get,set:set,forget:forget,state:state,ready:ready,subscribe:function(fn){listeners.push(fn);fn(state());}};
window.addEventListener("storage",function(event){
 if(event.key!==KEY&&event.key!==null)return;
 var saved=valid(event.newValue);
 if(saved)set(saved,true);else forget();
});
})();
