(function(){
"use strict";
var messages=[],extraNotes="",busy=false,lastTrigger=null;
window.WOLF_API_ENDPOINT="https://wolf-ai-backend.scott-woolfolkrealtor.workers.dev/ask";
var dialog=document.createElement("dialog");dialog.id="wolfDialog";
dialog.innerHTML='<form method="dialog" class="wolfHead"><div><strong>Wolf</strong><small>Live game help</small></div><button aria-label="Close Wolf">Close</button></form>'+
'<p class="wolfHint">Tell me the play. I can use tracked creatures and counters; tell me about anything missing.</p>'+
'<div class="wolfActions"><button id="wolfDictate" type="button">Speak question</button><button id="wolfRead" type="button">Read answer</button><button id="wolfStop" type="button">Stop voice</button></div><label><input id="wolfAutoRead" type="checkbox"> Read answers aloud</label><p id="wolfVoiceStatus" role="status"></p>'+
'<label>Private test access code <input id="wolfAccess" type="password" autocomplete="off" maxlength="480" placeholder="Your WOLF_TEST_TOKEN"></label><small>Private testing only. Enter your access code, never your OpenAI API key.</small>'+
'<label>Player asking <select id="wolfPlayer"></select></label>'+
'<details><summary>What Wolf knows</summary><div id="wolfContext"></div></details>'+
'<label>Other cards or effects <textarea id="wolfNotes" maxlength="4000" rows="2" placeholder="Kyle has Vorinclex. I have Doubling Season."></textarea></label>'+
'<div id="wolfMessages" role="log" aria-live="polite"></div>'+
'<form id="wolfQuestionForm"><label>Your question<textarea id="wolfQuestion" rows="2" maxlength="2000" required placeholder="What happens when Ouroboroid triggers?"></textarea></label>'+
'<div class="wolfActions"><button id="wolfSend" type="submit">Ask Wolf</button><button id="wolfClear" type="button">New question</button></div></form>'+
'<p id="wolfStatus" role="status"></p>';
document.body.appendChild(dialog);
function node(id){return document.getElementById(id);}
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
 dialog.showModal();
}
document.querySelectorAll(".askWolf").forEach(function(button){button.addEventListener("click",openWolf);});
node("wolfPlayer").onchange=function(){messages=[];node("wolfMessages").replaceChildren();showContext();};
node("wolfClear").onclick=function(){messages=[];extraNotes="";node("wolfNotes").value="";node("wolfQuestion").value="";node("wolfMessages").replaceChildren();};
dialog.addEventListener("close",function(){stopVoice();if(lastTrigger)lastTrigger.focus({preventScroll:true});});
node("wolfQuestionForm").onsubmit=async function(event){
 event.preventDefault();if(busy||!endpoint())return;
 var question=node("wolfQuestion").value.trim();if(!question)return;
 var access=node("wolfAccess").value.trim();if(!access){node("wolfStatus").textContent="Enter your private test access code first.";node("wolfAccess").focus();return;}
 var currentNotes=node("wolfNotes").value.trim();
 if(currentNotes!==extraNotes){messages=[];node("wolfMessages").replaceChildren();extraNotes=currentNotes;}
 var payload=JSON.stringify({question:question,context:getContext(),untrackedNotes:extraNotes,messages:messages.slice(-8)});
 if(new TextEncoder().encode(payload).length>16000){node("wolfStatus").textContent="This battlefield and conversation exceed the test limit. Start a new question or shorten the notes.";return;}
 stopVoice();busy=true;node("wolfSend").disabled=true;node("wolfPlayer").disabled=true;node("wolfClear").disabled=true;
 node("wolfStatus").textContent="Wolf is checking the play…";
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},45000);
 try{
  var response=await fetch(endpoint(),{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json","Authorization":"Bearer "+access},
   signal:controller.signal,body:payload});
  var data=await response.json();
  if(!response.ok)throw new Error(data.error||"Wolf could not answer right now. Your question is still here.");
  if(typeof data.answer!=="string"||!data.answer.trim())throw new Error("Wolf returned no answer. Try again.");
  addMessage("user",question);addMessage("assistant",data.answer,data.sources);
  messages.push({role:"user",content:question},{role:"assistant",content:data.answer});
  node("wolfQuestion").value="";node("wolfStatus").textContent="Wolf has not changed any game totals.";
 }catch(error){node("wolfStatus").textContent=error.name==="AbortError"?"Wolf took too long. Your question is still here.":error.message;}
 finally{clearTimeout(timer);busy=false;node("wolfSend").disabled=!endpoint();node("wolfPlayer").disabled=false;node("wolfClear").disabled=false;}
};
var recognition=null,voiceMode="",lastAnswer="",voiceRunning=false;
var Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
var wakeButton=document.createElement("button");wakeButton.type="button";wakeButton.textContent="Enable Hey Wolf";wakeButton.className="askWolf";
var navigation=document.querySelector(".gameNavigation");if(navigation)navigation.appendChild(wakeButton);
var wakeTracker=wakeButton.cloneNode(true);var trackerNav=document.querySelector(".trackerNavigation");if(trackerNav)trackerNav.appendChild(wakeTracker);
function voiceStatus(text){node("wolfVoiceStatus").textContent=text;wakeButton.textContent=voiceRunning?"Stop listening":"Enable Hey Wolf";wakeTracker.textContent=wakeButton.textContent;}
function stopVoice(){
 voiceMode="";voiceRunning=false;
 if(recognition){recognition.onend=null;recognition.onerror=null;recognition.onresult=null;try{recognition.abort();}catch(e){}recognition=null;}
 if(window.speechSynthesis)window.speechSynthesis.cancel();
 voiceStatus("Voice stopped.");
}
function speakAnswer(){
 if(!lastAnswer){voiceStatus("Ask a question first.");return;}
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){voiceStatus("This browser does not support answer playback.");return;}
 stopVoice();
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
 utterance.onend=function(){voiceStatus("Playback finished. Tap Enable Hey Wolf to listen again.");};
 utterance.onerror=function(){voiceStatus("Playback could not start. Tap Read answer to try again.");};
 window.speechSynthesis.speak(utterance);voiceStatus("Reading Wolf's answer…");
}
function startVoice(mode){
 stopVoice();
 if(!Recognition){voiceStatus("Voice recognition is unavailable here. Open this app in Safari, or use your keyboard's dictation microphone.");if(!dialog.open)openWolf({currentTarget:wakeButton});return;}
 voiceMode=mode;recognition=new Recognition();recognition.lang="en-US";recognition.continuous=true;recognition.interimResults=false;
 recognition.onstart=function(){voiceRunning=true;voiceStatus(mode==="wake"?"Listening for Hey Wolf while this page is open.":"Listening for your question…");};
 recognition.onresult=function(event){
  for(var i=event.resultIndex;i<event.results.length;i++){
   if(!event.results[i].isFinal)continue;
   var words=event.results[i][0].transcript.trim();
   if(voiceMode==="wake"){
    var match=/\bhey[ ,]+wolf\b[ ,.!?:-]*(.*)/i.exec(words);if(!match)continue;
    if(!dialog.open)openWolf({currentTarget:wakeButton});
    voiceMode="question";voiceStatus("Wolf is listening. Say your question.");
    if(match[1])node("wolfQuestion").value=match[1].slice(0,2000);
   }else if(voiceMode==="question"){
    node("wolfQuestion").value=(node("wolfQuestion").value+" "+words).trim().slice(0,2000);
    voiceStatus("Question captured. Review it, then tap Ask Wolf.");
   }
  }
 };
 recognition.onerror=function(event){voiceMode="";voiceRunning=false;voiceStatus(event.error==="not-allowed"?"Microphone access was denied. Allow microphone access in Safari to use voice.":"Voice recognition stopped. Try Safari or keyboard dictation.");};
 recognition.onend=function(){voiceRunning=false;voiceMode="";voiceStatus("Listening ended. Tap Enable Hey Wolf or Speak question to resume.");};
 try{recognition.start();}catch(e){voiceMode="";voiceStatus("Could not start listening. Try Safari or keyboard dictation.");}
}
wakeButton.onclick=wakeTracker.onclick=function(){if(voiceRunning)stopVoice();else startVoice("wake");};
node("wolfDictate").onclick=function(){startVoice("question");};
node("wolfRead").onclick=speakAnswer;node("wolfStop").onclick=stopVoice;
node("wolfAutoRead").onchange=function(){if(!this.checked&&window.speechSynthesis)window.speechSynthesis.cancel();};
document.addEventListener("visibilitychange",function(){if(document.hidden)stopVoice();});

})();