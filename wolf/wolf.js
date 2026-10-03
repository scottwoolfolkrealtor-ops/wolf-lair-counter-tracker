(function(){
"use strict";
var messages=[],extraNotes="",busy=false,lastTrigger=null;
var voiceFromBattlefield=false,voicePlayerIndex=null,voiceSessionSerial=0;
window.WOLF_API_ENDPOINT="https://wolf-ai-backend.scott-woolfolkrealtor.workers.dev/ask";
var dialog=document.createElement("dialog");dialog.id="wolfDialog";
dialog.innerHTML='<form method="dialog" class="wolfHead"><div><strong>Wolf</strong><small>Live game help</small></div><button aria-label="Close Wolf">Close</button></form>'+
'<p class="wolfHint">Tell me the play. I can use tracked creatures and counters; tell me about anything missing.</p>'+
'<div class="wolfActions"><button id="wolfDictate" type="button">Speak question</button><button id="wolfRead" type="button">Read answer</button><button id="wolfStop" type="button">Stop voice</button></div><label><input id="wolfAutoRead" type="checkbox"> Read answers aloud</label><label><input id="wolfAutoSend" type="checkbox" checked> Send spoken questions after a pause</label><p id="wolfVoiceStatus" role="status"></p>'+
'<details id="wolfAccessSettings" open><summary>Private test access</summary><label>Access code <input id="wolfAccess" type="password" autocomplete="off" maxlength="480" placeholder="Your WOLF_TEST_TOKEN"></label><label><input id="wolfRemember" type="checkbox" checked> Remember on this device</label><small>Save your private test code in this browser. Never enter your OpenAI API key.</small><button id="wolfForget" type="button">Forget saved code</button></details>'+
'<label>Player asking <select id="wolfPlayer"></select></label>'+
'<details><summary>What Wolf knows</summary><div id="wolfContext"></div></details>'+
'<label>Other cards or effects <textarea id="wolfNotes" maxlength="4000" rows="2" placeholder="Kyle has Vorinclex. I have Doubling Season."></textarea></label>'+
'<p id="wolfStatus" role="status"></p><div id="wolfMessages" role="log" aria-live="polite"></div>'+
'<form id="wolfQuestionForm"><label>Your question<textarea id="wolfQuestion" rows="2" maxlength="2000" required placeholder="What happens when Ouroboroid triggers?"></textarea></label>'+
'<div class="wolfActions"><button id="wolfSend" type="submit">Ask Wolf</button><button id="wolfClear" type="button">New question</button></div></form>'+
'';
document.body.appendChild(dialog);
function node(id){return document.getElementById(id);}

var accessDialog=document.createElement("dialog");accessDialog.id="wolfVoiceAccessDialog";
accessDialog.innerHTML='<form id="wolfVoiceAccessForm"><strong>Enable Wolf voice</strong><p>Enter your private Wolf code once for this browser. On iPhone, use Safari to keep it between visits.</p>'+
'<label>Private access code<input id="wolfVoiceAccessCode" type="password" required autocomplete="off" maxlength="480" placeholder="Your WOLF_TEST_TOKEN"></label>'+
'<label><input id="wolfVoiceRemember" type="checkbox" checked> Remember on this device</label><small>Use your Wolf access code, never your OpenAI API key.</small>'+
'<p id="wolfVoiceAccessStatus" role="status"></p><div class="wolfActions"><button id="wolfVoiceAccessCancel" type="button">Cancel</button><button type="submit">Save and listen</button></div></form>';
document.body.appendChild(accessDialog);

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
 if(!node("wolfRemember").checked)return true;
 try{
  localStorage.setItem(ACCESS_STORAGE,access);
   node("wolfAccessSettings").open=false;
  return true;
 }catch(e){node("wolfStatus").textContent="This browser could not remember your code. It is available for this visit.";return false;}
}
function accessCode(){
 if(!node("wolfAccess").value.trim()&&node("wolfRemember").checked)loadAccess();
 return node("wolfAccess").value.trim();
}
function forgetAccess(){
 try{localStorage.removeItem(ACCESS_STORAGE);}catch(e){}
}
node("wolfAccess").addEventListener("change",function(){var access=this.value.trim();if(access)saveAccess(access);else forgetAccess();});
node("wolfRemember").onchange=function(){if(!this.checked)forgetAccess();else if(node("wolfAccess").value.trim())saveAccess(node("wolfAccess").value.trim());};
node("wolfForget").onclick=function(){
 forgetAccess();node("wolfAccess").value="";node("wolfRemember").checked=false;node("wolfAccessSettings").open=true;
 stopVoice();
 node("wolfStatus").textContent="Saved access code removed from this browser.";
};
loadAccess();
node("wolfVoiceAccessCancel").onclick=function(){accessDialog.close();};
accessDialog.addEventListener("close",function(){node("wolfVoiceAccessCode").value="";});
node("wolfVoiceAccessForm").onsubmit=function(event){
 event.preventDefault();var access=node("wolfVoiceAccessCode").value.trim();
 if(!access){node("wolfVoiceAccessStatus").textContent="Enter your private Wolf access code.";node("wolfVoiceAccessCode").focus();return;}
 node("wolfAccess").value=access;node("wolfRemember").checked=node("wolfVoiceRemember").checked;
 if(!node("wolfRemember").checked)forgetAccess();
 saveAccess(access);node("wolfAccessSettings").open=false;accessDialog.close();beginWake();
};

var READ_STORAGE="wolfLairVoiceRead1";
try{var readPreference=localStorage.getItem(READ_STORAGE);node("wolfAutoRead").checked=readPreference===null||readPreference==="true";}catch(e){node("wolfAutoRead").checked=true;}
function requestStatus(text){
 node("wolfStatus").textContent=text;
 if(dialog.open&&node("wolfStatus").scrollIntoView)node("wolfStatus").scrollIntoView({block:"nearest",behavior:"smooth"});
}
function getContext(){
 var context=window.getWolfGameContext();
 if(voiceFromBattlefield&&voicePlayerIndex!==null)context.selectedPlayerIndex=voicePlayerIndex;
 else if(node("wolfPlayer").value!=="")context.selectedPlayerIndex=Number(node("wolfPlayer").value);
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
function addMessage(role,text,sources,readAllowed){
 var p=document.createElement("p");p.className="wolfMessage "+role;
 text=String(text).replace(/\[([^\]]+)\]\(https:\/\/[^\s)]+\)/g,"$1");
 p.textContent=(role==="user"?"You: ":"Wolf: ")+text;
 node("wolfMessages").appendChild(p);
 if(role==="assistant"){lastAnswer=text;if(readAllowed!==false&&node("wolfAutoRead").checked)speakAnswer();}
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
 cancelSpokenSubmission();questionUntil=0;
 if(wakeEnabled){
  if(recognition){voiceMode="wake";voiceStatus("Listening for Hey Wolf on the battlefield.");}
  else resumeWake();
 }else stopVoice();
 if(lastTrigger)lastTrigger.focus({preventScroll:true});
});
node("wolfQuestionForm").onsubmit=async function(event){
 event.preventDefault();if(busy||!endpoint())return;
 var question=node("wolfQuestion").value.trim();if(!question)return;
 var backgroundRequest=voiceFromBattlefield,requestVoiceSerial=voiceSessionSerial;
 var access=accessCode();if(!access){node("wolfAccessSettings").open=true;requestStatus("Enter your private test access code first.");if(dialog.open)node("wolfAccess").focus();else{stopVoice();voiceStatus("Tap Wolf to save your private access code before listening.","error");}return;}
 var currentNotes=node("wolfNotes").value.trim();
 if(currentNotes!==extraNotes){messages=[];node("wolfMessages").replaceChildren();extraNotes=currentNotes;}
 var payload=JSON.stringify({question:question,context:getContext(),untrackedNotes:extraNotes,messages:messages.slice(-8)});
 if(new TextEncoder().encode(payload).length>16000){node("wolfStatus").textContent="This battlefield and conversation exceed the test limit. Start a new question or shorten the notes.";return;}
 if(node("wolfAutoRead").checked&&!speechPrepared&&!voicePlayback)playSpeech("Wolf is ready.",{welcome:true});
 questionUntil=0;pauseListening();busy=true;node("wolfSend").disabled=true;node("wolfPlayer").disabled=true;node("wolfClear").disabled=true;
 addMessage("user",question);requestStatus("Wolf is checking the play…");voiceStatus("Question sent. Wolf is checking the play…");
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},45000);
 try{
  var response=await fetch(endpoint(),{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json","Authorization":"Bearer "+access},
   signal:controller.signal,body:payload});
  var data=await response.json();
  if(!response.ok){
   if(response.status===401){forgetAccess();node("wolfAccess").value="";node("wolfAccessSettings").open=true;wakeEnabled=false;}
   throw new Error(data.error||"Wolf could not answer right now. Your question is still here.");
  }
  if(typeof data.answer!=="string"||!data.answer.trim())throw new Error("Wolf returned no answer. Try again.");
  addMessage("assistant",data.answer,data.sources,!backgroundRequest||requestVoiceSerial===voiceSessionSerial);
  messages.push({role:"user",content:question},{role:"assistant",content:data.answer});
  node("wolfQuestion").value="";requestStatus("Answer received. Wolf has not changed any game totals.");saveAccess(access);
 }catch(error){var message=error.name==="AbortError"?"Wolf took too long. Your question is still here.":error.message;requestStatus(message);voiceStatus(message,"error");if(backgroundRequest&&requestVoiceSerial===voiceSessionSerial&&node("wolfAutoRead").checked)playSpeech(message,{status:message});}
 finally{clearTimeout(timer);busy=false;node("wolfSend").disabled=!endpoint();node("wolfPlayer").disabled=false;node("wolfClear").disabled=false;voiceFromBattlefield=false;voicePlayerIndex=null;resumeWake();}
};
var recognition=null,voiceMode="",lastAnswer="",voiceRunning=false;
var wakeEnabled=false,voicePlayback=false,restartTimer=null,shortStarts=0,playbackSerial=0,voiceSubmitTimer=null,questionUntil=0;
var voiceSpeaking=false,speechPrepared=false,activeUtterance=null,speechTimer=null,speechQueueTimer=null,pendingSpeech=null;
var Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
function createWolfButton(){
 var button=document.createElement("button");button.type="button";button.className="wolfWakeButton";
 var icon=document.createElement("span");icon.className="wolfVoiceIcon";icon.setAttribute("aria-hidden","true");
 var head=document.createElement("img");head.src="./wolf/wolf-head.svg?v=9";head.alt="";head.width=28;head.height=28;icon.appendChild(head);
 var label=document.createElement("span");label.className="wolfVoiceLabel";label.textContent="Voice off";
 button.appendChild(icon);button.appendChild(label);return button;
}
var wakeButton=createWolfButton();
var navigation=document.querySelector(".gameNavigation");if(navigation)navigation.appendChild(wakeButton);
var wakeTracker=createWolfButton();var trackerNav=document.querySelector(".trackerNavigation");if(trackerNav)trackerNav.appendChild(wakeTracker);
var wakeStatuses=[];
[navigation,trackerNav].forEach(function(nav){
 if(!nav)return;
 var status=document.createElement("p");status.className="wolfWakeStatus";status.setAttribute("role","status");
 nav.insertAdjacentElement("afterend",status);wakeStatuses.push(status);
});
function voiceStatus(text,state){
 node("wolfVoiceStatus").textContent=text;
 wakeStatuses.forEach(function(status){status.textContent=text;});
 state=state||(voiceSpeaking?"speaking":voicePlayback?"queued":busy?"thinking":pendingSpeech?"answer":voiceRunning?"listening":wakeEnabled?"ready":"off");
 var labels={off:"Voice off",ready:"Starting",queued:"Starting",answer:"Tap to hear",listening:"Listening",thinking:"Checking",speaking:"Speaking",error:"Try again"};
 [wakeButton,wakeTracker].forEach(function(button){
  button.setAttribute("data-state",state);button.setAttribute("aria-pressed",String(wakeEnabled));
  button.setAttribute("aria-label",(pendingSpeech?"Play Wolf's voice. ":wakeEnabled?"Disable Hey Wolf. ":"Enable Hey Wolf. ")+text);
  button.children[1].textContent=labels[state]||state;
 });
}
function cancelSpokenSubmission(){
 if(voiceSubmitTimer!==null){clearTimeout(voiceSubmitTimer);voiceSubmitTimer=null;}
}
function scheduleSpokenQuestion(){
 cancelSpokenSubmission();
 var question=node("wolfQuestion").value.trim();
 if(!question||busy)return;
 if(!node("wolfAutoSend").checked){voiceStatus("Question captured. Tap Ask Wolf to send it.");return;}
 if(!accessCode()){
  node("wolfAccessSettings").open=true;requestStatus("Enter your private access code, then tap Ask Wolf to send this question.");
  stopVoice();voiceStatus("Question captured. Tap Wolf to save your private access code.","error");return;
 }
 voiceStatus("Question captured. Sending after a short pause…");
 voiceSubmitTimer=setTimeout(function(){
  voiceSubmitTimer=null;
  if(document.hidden||busy||!node("wolfAutoSend").checked)return;
  if(node("wolfQuestion").value.trim()!==question){voiceStatus("Question edited. Tap Ask Wolf when ready.");return;}
  node("wolfQuestionForm").requestSubmit();
 },1400);
}
node("wolfQuestion").addEventListener("input",cancelSpokenSubmission);
node("wolfAutoSend").onchange=function(){if(!this.checked)cancelSpokenSubmission();};
function pauseListening(){
 cancelSpokenSubmission();
 if(restartTimer!==null){clearTimeout(restartTimer);restartTimer=null;}
 voiceMode="";voiceRunning=false;
 if(recognition){recognition.onend=null;recognition.onerror=null;recognition.onresult=null;recognition.onstart=null;try{recognition.abort();}catch(e){}recognition=null;}
}
function stopVoice(){
 wakeEnabled=false;questionUntil=0;voiceFromBattlefield=false;voicePlayerIndex=null;voiceSessionSerial++;pauseListening();cancelPlayback();
 voiceStatus("Voice off. Tap Enable Hey Wolf to listen.");
}
function resumeWake(){
 if(!wakeEnabled||document.hidden||busy||voicePlayback||pendingSpeech||recognition||restartTimer!==null)return;
 voiceStatus("Hey Wolf enabled. Resuming listening…");
 restartTimer=setTimeout(function(){restartTimer=null;
  if(wakeEnabled&&!document.hidden&&!busy&&!voicePlayback&&!pendingSpeech&&!recognition)startVoice((dialog.open||voiceFromBattlefield)&&Date.now()<questionUntil?"question":"wake");
 },500);
}
function speakAnswer(){
 if(!lastAnswer){voiceStatus("Ask a question first.");return;}
 var spoken=lastAnswer.replace(/\([^)]*\.(?:com|org|net)[^)]*\)/g,"").trim().split(/\n\s*\n/)[0];
 if(spoken.length>600){var sentences=spoken.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[spoken];spoken=sentences.slice(0,3).join("").trim();}
 playSpeech(spoken);
}
function clearSpeechTimers(){
 if(speechTimer!==null){clearTimeout(speechTimer);speechTimer=null;}
 if(speechQueueTimer!==null){clearTimeout(speechQueueTimer);speechQueueTimer=null;}
}
function cancelPlayback(){
 playbackSerial++;clearSpeechTimers();
 if(activeUtterance){activeUtterance.onstart=activeUtterance.onend=activeUtterance.onerror=activeUtterance.onpause=null;activeUtterance=null;}
 voicePlayback=false;voiceSpeaking=false;pendingSpeech=null;
 if(window.speechSynthesis){try{window.speechSynthesis.cancel();}catch(e){}}
}
function playSpeech(spoken,options){
 options=options||{};
 if(document.hidden)return;
 pauseListening();
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){voiceStatus("Voice playback is unavailable here. Open Wolf Lair in Safari to hear answers.","error");return;}
 var synth=window.speechSynthesis;
 var replacing=!!activeUtterance||voicePlayback||synth.speaking||synth.pending;
 if(replacing)cancelPlayback();else clearSpeechTimers();
 var serial=++playbackSerial,started=false;pendingSpeech=null;voicePlayback=true;voiceSpeaking=false;
 var utterance=new SpeechSynthesisUtterance(spoken);
 activeUtterance=utterance;
 var voices=[];try{voices=synth.getVoices().filter(function(v){return /^en[-_]/i.test(v.lang);});}catch(e){}
 voices.sort(function(a,b){
  function score(v){return (/enhanced|premium|natural/i.test(v.name)?10:0)+(v.lang==="en-US"?3:0)+(v.default?1:0);}
  return score(b)-score(a);
 });
 if(voices.length)utterance.voice=voices[0];
 utterance.lang=utterance.voice?utterance.voice.lang:"en-US";utterance.rate=1.12;utterance.pitch=1;utterance.volume=1;
 function failed(){
  if(serial!==playbackSerial)return;
  cancelPlayback();pendingSpeech={text:spoken,welcome:!!options.welcome,afterMode:options.afterMode||"",status:options.status||""};
  voiceStatus(options.status?options.status+" Tap Wolf to hear this message.":options.welcome?"Tap Wolf to turn on spoken answers.":"Your answer is ready. Tap Wolf to hear it.","answer");
 }
 utterance.onstart=function(){
  if(serial!==playbackSerial)return;
  clearSpeechTimers();started=true;voiceSpeaking=true;speechPrepared=true;
  voiceStatus(options.status|| (options.welcome?"Wolf is ready…":"Reading Wolf's answer…"),"speaking");
  speechTimer=setTimeout(failed,Math.min(90000,Math.max(10000,spoken.length*100)));
 };
 utterance.onend=function(){
  if(serial!==playbackSerial)return;
  if(!started){failed();return;}
  clearSpeechTimers();activeUtterance=null;voicePlayback=false;voiceSpeaking=false;pendingSpeech=null;
  voiceStatus(options.status||"Playback finished.");
  if(options.afterMode&&(!options.welcome||speechPrepared)){
   if(options.afterMode!=="wake"||wakeEnabled)startVoice(options.afterMode);
  }else resumeWake();
 };
 utterance.onerror=utterance.onpause=failed;
 function speak(){
  speechQueueTimer=null;if(serial!==playbackSerial||document.hidden)return;
  voiceStatus(options.status|| (options.welcome?"Turning on spoken answers…":"Answer received. Starting voice…"),"queued");
  speechTimer=setTimeout(failed,4500);
  try{if(synth.paused&&typeof synth.resume==="function")synth.resume();synth.speak(utterance);}catch(e){failed();}
 }
 // A canceled platform utterance may finish asynchronously; let it settle before replacing it.
 if(replacing)speechQueueTimer=setTimeout(speak,150);else speak();
}
function startVoice(mode){
 pauseListening();
 if(document.hidden||busy||voicePlayback)return;
 if(!Recognition){wakeEnabled=false;voiceStatus("Voice recognition is unavailable here. Open this app in Safari, or use keyboard dictation.","error");return;}
 voiceMode=mode;var current=new Recognition();recognition=current;
 current.lang="en-US";current.continuous=true;current.interimResults=true;
 var processedResults=new Set();
 var startedAt=Date.now();
 current.onstart=function(){if(recognition!==current)return;voiceRunning=true;voiceStatus(voiceMode==="wake"?"Listening for Hey Wolf on the battlefield.":"Listening for your question…");};
 current.onresult=function(event){
  if(recognition!==current)return;
  shortStarts=0;
  for(var i=event.resultIndex;i<event.results.length;i++){
   if(!event.results[i].isFinal){cancelSpokenSubmission();continue;}
   if(processedResults.has(i))continue;processedResults.add(i);
   var words=event.results[i][0].transcript.trim();
   if(voiceMode==="wake"){
    var match=/\bhey[ ,]+wolf\b[ ,.!?:-]*(.*)/i.exec(words);if(!match)continue;
    voiceFromBattlefield=true;voicePlayerIndex=window.getWolfGameContext().selectedPlayerIndex;
    voiceMode="question";questionUntil=Date.now()+15000;voiceStatus("Wolf is listening. Say your question.");
    node("wolfQuestion").value=match[1].slice(0,2000);scheduleSpokenQuestion();
   }else if(voiceMode==="question"){
    questionUntil=Date.now()+15000;
    node("wolfQuestion").value=(node("wolfQuestion").value+" "+words).trim().slice(0,2000);
    scheduleSpokenQuestion();
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
  if(voiceSubmitTimer!==null)return;
  shortStarts=Date.now()-startedAt<1500?shortStarts+1:0;
  if(wakeEnabled&&shortStarts>=3){stopVoice();voiceStatus("This browser keeps stopping the microphone. Tap Enable Hey Wolf to retry in Safari.");return;}
  if(wakeEnabled)resumeWake();
  else voiceStatus("Listening ended. Tap Speak question to resume.");
 };
 try{current.start();}catch(e){stopVoice();voiceStatus("Could not start listening. Tap Enable Hey Wolf to retry in Safari.");}
}
function beginWake(){
 if(!accessCode()){
  voiceStatus("Save your private access code once to enable Wolf voice.","error");
  node("wolfVoiceAccessCode").value="";node("wolfVoiceRemember").checked=node("wolfRemember").checked;
  node("wolfVoiceAccessStatus").textContent="";
  if(!accessDialog.open)accessDialog.showModal();
  return;
 }
 saveAccess(accessCode());
 shortStarts=0;wakeEnabled=true;voiceSessionSerial++;
 if(busy||voicePlayback){voiceStatus("Hey Wolf enabled. Listening will resume after this answer.");return;}
 // Call speech directly from this tap so iPhone can enable subsequent spoken replies.
 if(node("wolfAutoRead").checked&&!speechPrepared)playSpeech("Wolf is ready.",{welcome:true,afterMode:"wake"});else startVoice("wake");
}
wakeButton.onclick=wakeTracker.onclick=function(){
 if(pendingSpeech){
  if(!accessCode()){cancelPlayback();beginWake();return;}
  var retry=pendingSpeech;playSpeech(retry.text,retry);return;
 }
 if(wakeEnabled){stopVoice();return;}
 beginWake();
};
node("wolfDictate").onclick=function(){voiceFromBattlefield=false;voicePlayerIndex=null;if(node("wolfAutoRead").checked&&!speechPrepared)playSpeech("Wolf is ready.",{welcome:true,afterMode:"question"});else startVoice("question");};
node("wolfRead").onclick=speakAnswer;node("wolfStop").onclick=stopVoice;
node("wolfAutoRead").onchange=function(){
 try{localStorage.setItem(READ_STORAGE,String(this.checked));}catch(e){}
 if(!this.checked&&window.speechSynthesis){cancelPlayback();resumeWake();}
};
voiceStatus("Voice off. Tap Enable Hey Wolf to listen.");
document.addEventListener("visibilitychange",function(){if(document.hidden)stopVoice();});
window.addEventListener("pagehide",stopVoice);

})();
