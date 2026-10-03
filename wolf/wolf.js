(function(){
"use strict";
var messages=[],extraNotes="",busy=false,lastTrigger=null;
window.WOLF_API_ENDPOINT="https://wolf-ai-backend.scott-woolfolkrealtor.workers.dev/ask";
var dialog=document.createElement("dialog");dialog.id="wolfDialog";
dialog.innerHTML='<form method="dialog" class="wolfHead"><div><strong>Wolf</strong><small>Live game help</small></div><button aria-label="Close Wolf">Close</button></form>'+
'<p class="wolfHint">Tell me the play. I can use tracked creatures and counters; tell me about anything missing.</p>'+
'<div class="wolfActions"><button id="wolfDictate" type="button">Speak question</button><button id="wolfRead" type="button">Read answer</button><button id="wolfStop" type="button">Stop voice</button></div><label><input id="wolfAutoRead" type="checkbox"> Read answers aloud</label><p id="wolfVoiceStatus" role="status"></p>'+
'<details id="wolfAccessSettings" open><summary>Private test access</summary><label>Access code <input id="wolfAccess" type="password" autocomplete="off" maxlength="480" placeholder="Your WOLF_TEST_TOKEN"></label><label><input id="wolfRemember" type="checkbox" checked> Remember on this device</label><small>Save your private test code in this browser. Never enter your OpenAI API key.</small><button id="wolfForget" type="button">Forget saved code</button></details>'+
'<label>Player asking <select id="wolfPlayer"></select></label>'+
'<details><summary>What Wolf knows</summary><div id="wolfContext"></div></details>'+
'<label>Other cards or effects <textarea id="wolfNotes" maxlength="4000" rows="2" placeholder="Kyle has Vorinclex. I have Doubling Season."></textarea></label>'+
'<div id="wolfMessages" role="log" aria-live="polite"></div>'+
'<form id="wolfQuestionForm"><label>Your question<textarea id="wolfQuestion" rows="2" maxlength="2000" required placeholder="What happens when Ouroboroid triggers?"></textarea></label>'+
'<div class="wolfActions"><button id="wolfSend" type="submit">Ask Wolf</button><button id="wolfClear" type="button">New question</button></div></form>'+
'<p id="wolfStatus" role="status"></p>';
document.body.appendChild(dialog);
function node(id){return document.getElementById(id);}

var ACCESS_STORAGE="wolfLairPrivateAccess1";
function loadAccess(){
 try{
  var saved=localStorage.getItem(ACCESS_STORAGE);
  if(saved&&saved.length<=480){
   node("wolfAccess").value=saved;node("wolfRemember").checked=true;node("wolfAccessSettings").open=false;
  }
 }catch(e){}
}
function saveAccess(access){
 if(!node("wolfRemember").checked)return;
 try{
  localStorage.setItem(ACCESS_STORAGE,access);
  node("wolfAccessSettings").open=false;
 }catch(e){node("wolfStatus").textContent="Answer received. This browser could not remember your code.";}
}
function forgetAccess(){
 try{localStorage.removeItem(ACCESS_STORAGE);}catch(e){}
}
node("wolfRemember").onchange=function(){if(!this.checked)forgetAccess();};
node("wolfForget").onclick=function(){
 forgetAccess();node("wolfAccess").value="";node("wolfRemember").checked=false;node("wolfAccessSettings").open=true;
 node("wolfStatus").textContent="Saved access code removed from this browser.";
};
loadAccess();

function getContext(){
 var context=window.getWolfGameContext();
 context.selectedPlayerIndex=Number(node("wolfPlayer").value);
 return context;
}
function showContext(){
 var context=getContext(),host=node("wolfContext");host.replaceChildren();
 context.players.forEach(function(p){
  var row=document.createElement("p");
  row.textContent=p.name+": "+p.trackedCreatures.length+" tracked creature"+(p.trackedCreatures.length===1?"":"s")+". Other permanents and effects unknown.";
  host.appendChild(row);
 });
}
function addMessage(role,text,sources){
 var p=document.createElement("p");p.className="wolfMessage "+role;
 text=String(text).replace(/\[([^\]]+)\]\(https:\/\/[^\s)]+\)/g,"$1");
 p.textContent=(role==="user"?"You: ":"Wolf: ")+text;
 node("wolfMessages").appendChild(p);
 if(role==="assistant"){lastAnswer=text;if(node("wolfAutoRead").checked)speakAnswer();}
 if(role==="assistant"&&Array.isArray(sources)){
  var list=document.createElement("ul"),seen=new Set();
  sources.forEach(function(source){
   var url;try{url=new URL(source.url);}catch(e){return;}
   if(url.protocol!=="https:"||seen.has(url.href))return;seen.add(url.href);
   var li=document.createElement("li"),a=document.createElement("a");
   a.href=url.href;a.textContent=source.title||url.hostname;a.target="_blank";a.rel="noopener noreferrer";li.appendChild(a);list.appendChild(li);
  });node("wolfMessages").appendChild(list);
 }
}
function endpoint(){return typeof window.WOLF_API_ENDPOINT==="string"?window.WOLF_API_ENDPOINT:"";}
function openWolf(event){
 lastTrigger=event.currentTarget;
 var c=window.getWolfGameContext(),select=node("wolfPlayer");select.replaceChildren();
 c.players.forEach(function(p){
  var option=document.createElement("option");option.value=String(p.index);option.textContent=p.name;select.appendChild(option);
 });
 select.value=String(c.selectedPlayerIndex);showContext();
 node("wolfStatus").textContent=endpoint()?"Uses tracked information and what you tell Wolf.":"Wolf's AI connection is not configured yet. You can prepare your question here.";
 node("wolfSend").disabled=busy||!endpoint();
 if(!dialog.open){dialog.scrollTop=0;dialog.showModal();}
}
document.querySelectorAll(".askWolf").forEach(function(button){button.addEventListener("click",openWolf);});
node("wolfPlayer").onchange=function(){messages=[];node("wolfMessages").replaceChildren();showContext();};
node("wolfClear").onclick=function(){messages=[];extraNotes="";node("wolfNotes").value="";node("wolfQuestion").value="";node("wolfMessages").replaceChildren();};
dialog.addEventListener("close",function(){
 if(wakeEnabled){
  if(recognition){voiceMode="wake";voiceStatus("Listening for Hey Wolf on the battlefield.");}
  else resumeWake();
 }else stopVoice();
 if(lastTrigger)lastTrigger.focus({preventScroll:true});
});
node("wolfQuestionForm").onsubmit=async function(event){
 event.preventDefault();if(busy||!endpoint())return;
 var question=node("wolfQuestion").value.trim();if(!question)return;
 var access=node("wolfAccess").value.trim();if(!access){node("wolfStatus").textContent="Enter your private test access code first.";node("wolfAccess").focus();return;}
 var currentNotes=node("wolfNotes").value.trim();
 if(currentNotes!==extraNotes){messages=[];node("wolfMessages").replaceChildren();extraNotes=currentNotes;}
 var payload=JSON.stringify({question:question,context:getContext(),untrackedNotes:extraNotes,messages:messages.slice(-8)});
 if(new TextEncoder().encode(payload).length>16000){node("wolfStatus").textContent="This battlefield and conversation exceed the test limit. Start a new question or shorten the notes.";return;}
 pauseListening();busy=true;node("wolfSend").disabled=true;node("wolfPlayer").disabled=true;node("wolfClear").disabled=true;
 node("wolfStatus").textContent="Wolf is checking the play…";
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},45000);
 try{
  var response=await fetch(endpoint(),{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json","Authorization":"Bearer "+access},
   signal:controller.signal,body:payload});
  var data=await response.json();
  if(!response.ok){
   if(response.status===401){forgetAccess();node("wolfAccessSettings").open=true;}
   throw new Error(data.error||"Wolf could not answer right now. Your question is still here.");
  }
  if(typeof data.answer!=="string"||!data.answer.trim())throw new Error("Wolf returned no answer. Try again.");
  addMessage("user",question);addMessage("assistant",data.answer,data.sources);
  messages.push({role:"user",content:question},{role:"assistant",content:data.answer});
  node("wolfQuestion").value="";node("wolfStatus").textContent="Wolf has not changed any game totals.";saveAccess(access);
 }catch(error){node("wolfStatus").textContent=error.name==="AbortError"?"Wolf took too long. Your question is still here.":error.message;}
 finally{clearTimeout(timer);busy=false;node("wolfSend").disabled=!endpoint();node("wolfPlayer").disabled=false;node("wolfClear").disabled=false;resumeWake();}
};
var recognition=null,voiceMode="",lastAnswer="",voiceRunning=false;
var wakeEnabled=false,voicePlayback=false,restartTimer=null,shortStarts=0,playbackSerial=0;
var Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
var wakeButton=document.createElement("button");wakeButton.type="button";wakeButton.textContent="Enable Hey Wolf";wakeButton.className="wolfWakeButton";
var navigation=document.querySelector(".gameNavigation");if(navigation)navigation.appendChild(wakeButton);
var wakeTracker=wakeButton.cloneNode(true);var trackerNav=document.querySelector(".trackerNavigation");if(trackerNav)trackerNav.appendChild(wakeTracker);
var wakeStatuses=[];
[navigation,trackerNav].forEach(function(nav){
 if(!nav)return;
 var status=document.createElement("p");status.className="wolfWakeStatus";status.setAttribute("role","status");
 nav.insertAdjacentElement("afterend",status);wakeStatuses.push(status);
});
function voiceStatus(text){
 node("wolfVoiceStatus").textContent=text;
 wakeStatuses.forEach(function(status){status.textContent=text;});
 wakeButton.textContent=wakeEnabled?"Disable Hey Wolf":"Enable Hey Wolf";
 wakeTracker.textContent=wakeButton.textContent;
 [wakeButton,wakeTracker].forEach(function(button){button.setAttribute("aria-pressed",String(wakeEnabled));});
}
function pauseListening(){
 if(restartTimer!==null){clearTimeout(restartTimer);restartTimer=null;}
 voiceMode="";voiceRunning=false;
 if(recognition){recognition.onend=null;recognition.onerror=null;recognition.onresult=null;recognition.onstart=null;try{recognition.abort();}catch(e){}recognition=null;}
}
function stopVoice(){
 wakeEnabled=false;pauseListening();voicePlayback=false;playbackSerial++;
 if(window.speechSynthesis)window.speechSynthesis.cancel();
 voiceStatus("Voice off. Tap Enable Hey Wolf to listen.");
}
function resumeWake(){
 if(!wakeEnabled||document.hidden||busy||voicePlayback||recognition||restartTimer!==null)return;
 voiceStatus("Hey Wolf enabled. Resuming listening…");
 restartTimer=setTimeout(function(){restartTimer=null;
  if(wakeEnabled&&!document.hidden&&!busy&&!voicePlayback&&!recognition)startVoice("wake");
 },500);
}
function speakAnswer(){
 if(!lastAnswer){voiceStatus("Ask a question first.");return;}
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){voiceStatus("This browser does not support answer playback.");return;}
 pauseListening();var serial=++playbackSerial;
 window.speechSynthesis.cancel();voicePlayback=true;
 var spoken=lastAnswer.replace(/\([^)]*\.(?:com|org|net)[^)]*\)/g,"").trim().split(/\n\s*\n/)[0];
 if(spoken.length>600){var sentences=spoken.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[spoken];spoken=sentences.slice(0,3).join("").trim();}
 var utterance=new SpeechSynthesisUtterance(spoken);
 var voices=window.speechSynthesis.getVoices().filter(function(v){return /^en[-_]/i.test(v.lang);});
 voices.sort(function(a,b){
  function score(v){return (/enhanced|premium|natural/i.test(v.name)?10:0)+(v.lang==="en-US"?3:0)+(v.default?1:0);}
  return score(b)-score(a);
 });
 if(voices.length)utterance.voice=voices[0];
 utterance.lang=utterance.voice?utterance.voice.lang:"en-US";utterance.rate=1.12;utterance.pitch=1;
 function finished(text){if(serial!==playbackSerial)return;voicePlayback=false;voiceStatus(text);resumeWake();}
 utterance.onend=function(){finished("Playback finished.");};
 utterance.onerror=function(){finished("Playback could not start. Tap Read answer to try again.");};
 try{window.speechSynthesis.speak(utterance);voiceStatus("Reading Wolf's answer…");}
 catch(e){finished("Playback could not start. Tap Read answer to try again.");}
}
function startVoice(mode){
 pauseListening();
 if(document.hidden||busy||voicePlayback)return;
 if(!Recognition){wakeEnabled=false;if(!dialog.open)openWolf({currentTarget:wakeButton});voiceStatus("Voice recognition is unavailable here. Open this app in Safari, or use your keyboard's dictation microphone.");return;}
 voiceMode=mode;var current=new Recognition();recognition=current;
 current.lang="en-US";current.continuous=true;current.interimResults=false;
 var startedAt=Date.now();
 current.onstart=function(){if(recognition!==current)return;voiceRunning=true;voiceStatus(voiceMode==="wake"?"Listening for Hey Wolf on the battlefield.":"Listening for your question…");};
 current.onresult=function(event){
  if(recognition!==current)return;
  shortStarts=0;
  for(var i=event.resultIndex;i<event.results.length;i++){
   if(!event.results[i].isFinal)continue;
   var words=event.results[i][0].transcript.trim();
   if(voiceMode==="wake"){
    var match=/\bhey[ ,]+wolf\b[ ,.!?:-]*(.*)/i.exec(words);if(!match)continue;
    if(!dialog.open)openWolf({currentTarget:wakeButton});
    voiceMode="question";voiceStatus("Wolf is listening. Say your question.");
    node("wolfQuestion").value=match[1].slice(0,2000);
   }else if(voiceMode==="question"){
    node("wolfQuestion").value=(node("wolfQuestion").value+" "+words).trim().slice(0,2000);
    voiceStatus("Question captured. Review it, then tap Ask Wolf.");
   }
  }
 };
 current.onerror=function(event){
  if(recognition!==current)return;
  if(event.error==="no-speech")return;
  stopVoice();
  voiceStatus(event.error==="not-allowed"||event.error==="service-not-allowed"?"Microphone access was denied. Allow microphone access in Safari, then tap Enable Hey Wolf.":"Voice recognition stopped. Tap Enable Hey Wolf to retry, or use keyboard dictation.");
 };
 current.onend=function(){
  if(recognition!==current)return;
  recognition=null;voiceRunning=false;voiceMode="";
  shortStarts=Date.now()-startedAt<1500?shortStarts+1:0;
  if(wakeEnabled&&shortStarts>=3){stopVoice();voiceStatus("This browser keeps stopping the microphone. Tap Enable Hey Wolf to retry in Safari.");return;}
  if(wakeEnabled)resumeWake();
  else voiceStatus("Listening ended. Tap Speak question to resume.");
 };
 try{current.start();}catch(e){stopVoice();voiceStatus("Could not start listening. Tap Enable Hey Wolf to retry in Safari.");}
}
wakeButton.onclick=wakeTracker.onclick=function(){
 if(wakeEnabled){stopVoice();return;}
 shortStarts=0;wakeEnabled=true;
 if(busy||voicePlayback){voiceStatus("Hey Wolf enabled. Listening will resume after this answer.");return;}
 startVoice("wake");
};
node("wolfDictate").onclick=function(){startVoice("question");};
node("wolfRead").onclick=speakAnswer;node("wolfStop").onclick=stopVoice;
node("wolfAutoRead").onchange=function(){
 if(!this.checked&&window.speechSynthesis){playbackSerial++;voicePlayback=false;window.speechSynthesis.cancel();resumeWake();}
};
voiceStatus("Voice off. Tap Enable Hey Wolf to listen.");
document.addEventListener("visibilitychange",function(){if(document.hidden)stopVoice();});
window.addEventListener("pagehide",stopVoice);

})();
