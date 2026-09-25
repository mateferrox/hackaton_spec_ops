import './style.css';

(() => {
    'use strict';
    const $ = s => document.querySelector(s);
    const demo = $('#demo'), stage = $('#stage'), narrative = $('#narrative');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const cases = [
      {title:['Giulia è arrivata.','Ma non ha un account.'], question:'La lasci prenotare lo stesso?', choices:['Sì, falla entrare','Prima deve accedere'], rule:'Solo gli utenti registrati possono prenotare.', reason:'L’agente sta costruendo un accesso riservato. Questa risposta cambierebbe anche il percorso di prenotazione.', task:'Accesso alle sale'},
      {title:['Marco ha bisogno','di un’ora, tutta sua.'], question:'Come gli prenoti la sala?', choices:['Crea uno slot da un’ora','Due slot da 30 minuti'], rule:'Le prenotazioni avvengono in slot di 30 minuti, anche consecutivi.', reason:'Uno slot di un’ora cambia la regola che l’agente sta implementando per il calendario.', task:'Prenotazioni'},
      {title:['Sara ha un imprevisto.','La riunione è tra 10 minuti.'], question:'Può ancora cancellare?', choices:['Sì, annulla la prenotazione','Mantieni il limite di 24 ore'], rule:'È possibile cancellare fino a 24 ore prima dell’inizio.', reason:'La risposta cambia la policy di cancellazione e le condizioni comunicate agli utenti.', task:'Cancellazioni'}
    ];
    let current=0, state='question', chosen='', answered=new Set(), verificationTimer=0;
    let motionStopped=reduced.matches, sound=false, audio=null, effectStart=-20, tint=0, time=0;
    const escape = value => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const warnIcon='<svg class="warning-symbol" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3 26 25H2Z"/><path d="M14 10v7m0 3v1"/></svg>';
    function drawSteps(){
      const all=['Lettura della spec',...cases.map(c=>c.task),'Verifica finale'];
      $('#steps').innerHTML=all.map((title,i)=>{
        let status=i===0?'done':i===4?(state==='complete'?'done':state==='verifying'?'working':'pending'):answered.has(i-1)?'done':i-1===current?(state==='paused'?'paused':'working'):'pending';
        if(state==='complete')status='done';
        const attributes=`class="step" data-status="${status}" ${i>0&&i<4?`data-step="${i-1}" aria-label="${title}, ${status}"`:''}`;
        const content=`<span class="step-no">0${i+1}</span><span><span class="step-name">${title}</span><span class="step-status">${status}</span></span><i class="step-dot" aria-hidden="true"></i>`;
        return `<li>${i>0&&i<4?`<button ${attributes}>${content}</button>`:`<div ${attributes}>${content}</div>`}</li>`;
      }).join('');
    }
    let bed=null;
    const fadingBeds=new Set();
    const soundOnIcon='<path d="M11 4 5 9H2v6h3l6 5M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>';
    const soundOffIcon='<path d="M11 4 5 9H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>';
    function syncSoundControl(){
      $('#sound-label').textContent=sound?'Suono on':'Suono off';
      $('#sound-toggle').setAttribute('aria-label',sound?'Disattiva suono rilassante':'Attiva suono rilassante');
      $('#sound-toggle').setAttribute('aria-pressed',String(sound));
      $('#sound-toggle').querySelector('svg').innerHTML=sound?soundOnIcon:soundOffIcon;
    }
    function releaseBed(current){
      clearTimeout(current.timer);
      for(const node of current.sources){try{node.stop();}catch{/* already stopped */}}
      try{current.master.disconnect();}catch{/* already disconnected */}
    }
    function stopBed(immediate){
      const current=bed;
      if(!current)return;
      bed=null;
      if(immediate||!audio){releaseBed(current);return;}
      fadingBeds.add(current);
      const moment=audio.currentTime;
      const level=Math.max(current.master.gain.value,.0001);
      current.master.gain.cancelScheduledValues(moment);
      current.master.gain.setValueAtTime(level,moment);
      current.master.gain.linearRampToValueAtTime(0,moment+1);
      current.timer=setTimeout(()=>{fadingBeds.delete(current);releaseBed(current);},1050);
    }
    function startBed(){
      stopBed(true);
      for(const current of fadingBeds)releaseBed(current);
      fadingBeds.clear();
      const ctx=audio??=new AudioContext();
      void ctx.resume();
      const master=ctx.createGain();
      master.gain.setValueAtTime(0,ctx.currentTime);
      master.gain.linearRampToValueAtTime(.08,ctx.currentTime+1.4);
      const warmth=ctx.createBiquadFilter();
      warmth.type='lowpass';warmth.frequency.value=980;warmth.Q.value=.4;
      const breath=ctx.createGain();breath.gain.value=.82;
      breath.connect(warmth);warmth.connect(master);master.connect(ctx.destination);
      const sources=[];
      bed={master,sources,timer:0};
      for(const [frequency,level] of [[110,.2],[110.33,.14],[146.83,.1],[164.81,.08],[196,.04]]){
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine';osc.frequency.value=frequency;gain.gain.value=level;
        osc.connect(gain);gain.connect(breath);osc.start();sources.push(osc);
      }
      const lfo=ctx.createOscillator(),lfoDepth=ctx.createGain();
      lfo.frequency.value=.065;lfoDepth.gain.value=.12;
      lfo.connect(lfoDepth);lfoDepth.connect(breath.gain);lfo.start();sources.push(lfo);
      const length=ctx.sampleRate*3,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
      const noise=ctx.createBufferSource(),air=ctx.createBiquadFilter(),airGain=ctx.createGain();
      noise.buffer=buffer;noise.loop=true;air.type='bandpass';air.frequency.value=480;air.Q.value=.55;airGain.gain.value=.016;
      noise.connect(air);air.connect(airGain);airGain.connect(master);noise.start();sources.push(noise);
      const wind=ctx.createOscillator(),windDepth=ctx.createGain();
      wind.frequency.value=.028;windDepth.gain.value=160;
      wind.connect(windDepth);windDepth.connect(air.frequency);wind.start();sources.push(wind);
    }
    function failSound(){sound=false;stopBed(true);for(const current of fadingBeds)releaseBed(current);fadingBeds.clear();syncSoundControl();}
    function playNote(kind){
      if(!sound)return;
      try{
        const ctx=audio??=new AudioContext();
        void ctx.resume();
        const freqs=kind==='conflict'?[185,146]:kind==='complete'?[330,440,660]:[330,495];
        freqs.forEach((frequency,i)=>{
          const osc=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+i*.08;
          osc.type='sine';osc.frequency.value=frequency;
          gain.gain.setValueAtTime(0,start);
          gain.gain.linearRampToValueAtTime(.028,start+.015);
          gain.gain.exponentialRampToValueAtTime(.001,start+.26);
          osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+.28);
        });
      }catch{failSound();}
    }
    const button=(text,action,primary=false,key='')=>`<button class="answer ${primary?'primary':''}" data-action="${action}"><span>${text}</span>${key?`<span class="key" aria-hidden="true">${key}</span>`:''}</button>`;
    function render(focus=false){
      const c=cases[current];demo.dataset.scene=state;
      drawSteps();
      $('#case-counter').textContent=state==='complete'?'03 / 03':`${String(current+1).padStart(2,'0')} / 03`;
      $('#ambient-status').textContent=state==='paused'?'Simulazione in pausa. Il comando è tuo.':state==='conflict'?'Una decisione richiede la tua attenzione.':state==='complete'?'Tutte le decisioni sono allineate.':state==='verifying'?'Controllo delle risposte in corso.':'Il lavoro scorre. Tu scegli la direzione.';
      if(state==='question'){
        narrative.innerHTML=`<h1 class="story-title" tabindex="-1">${c.title.map(line=>`<span>${escape(line)}</span>`).join('')}</h1><p class="story-question">${escape(c.question)}</p><div class="answers">${button(escape(c.choices[0]),'conflict',true,'1')}${button(escape(c.choices[1]),'aligned',false,'2')}</div>`;
      }else if(state==='conflict'){
        narrative.innerHTML=`<div class="conflict-line">${warnIcon}<span>Hai scelto: «${escape(chosen)}»</span></div><h1 class="story-title" tabindex="-1"><span>Aspetta. Questa scelta</span><span>contraddice la spec.</span></h1><p class="rule">La spec dice: <strong>«${escape(c.rule)}»</strong></p><p class="advice">Conviene fermare l’esecuzione e chiarire la regola.</p><div class="answers">${button('Metti in pausa','pause',true)}${button('Resta nella spec','aligned')}<button class="subtle-link" data-action="spec">Leggi la regola</button></div>`;
      }else if(state==='paused'){
        narrative.innerHTML=`<div class="conflict-line">${warnIcon}<span>Simulazione sospesa · ${escape(c.task)}</span></div><h1 class="story-title" tabindex="-1"><span>Anche fermarsi</span><span>è una buona decisione.</span></h1><p class="story-question">Prima chiarisci la regola. Poi riprendi il lavoro.</p><p class="advice">${escape(c.reason)} Nessun agente reale è stato fermato.</p><div class="answers">${button('Resta nella spec e riprendi','aligned',true)}${button('Rivedi la spec','spec')}<button class="subtle-link" data-action="reconsider">Riconsidera la risposta</button></div>`;
      }else if(state==='verifying'){
        narrative.innerHTML='<h1 class="story-title" tabindex="-1"><span>Le risposte si collegano.</span><span>La rotta prende forma.</span></h1><p class="story-question">Un ultimo controllo sulle tre regole della spec.</p>';
      }else{
        narrative.innerHTML=`<h1 class="story-title" tabindex="-1"><span>Un mondo in movimento.</span><span>Una direzione chiara.</span></h1><p class="story-question">Tre casi concreti. Tre decisioni aderenti alla spec.</p><p class="advice">Hai completato la simulazione delle decisioni. Il codice resta da sviluppare e verificare.</p><div class="answers">${button('Ricomincia la demo','restart',true)}${button('Rileggi la spec','spec')}</div>`;
      }
      narrative.classList.remove('enter');void narrative.offsetWidth;narrative.classList.add('enter');
      if(focus)narrative.querySelector('h1').focus({preventScroll:true});
    }
    function action(name){
      if(name==='spec'){$('#spec-dialog').showModal();return;}
      if(name==='restart'){clearTimeout(verificationTimer);current=0;answered.clear();state='question';chosen='';effectStart=time;render(true);return;}
      if(state==='verifying')return;
      if(name==='conflict'&&state==='question'){chosen=cases[current].choices[0];state='conflict';effectStart=time;playNote('conflict');render(true);}
      else if(name==='pause'&&state==='conflict'){state='paused';render(true);}
      else if(name==='reconsider'&&state==='paused'){state='question';render(true);}
      else if(name==='aligned'&&['question','conflict','paused'].includes(state)){
        answered.add(current);effectStart=time;playNote('aligned');
        const next=cases.findIndex((_,i)=>!answered.has(i));
        if(next>=0){current=next;state='question';render(true);}
        else{state='verifying';render(true);verificationTimer=setTimeout(()=>{state='complete';playNote('complete');render(true);},1400);}
      }
    }
    narrative.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)action(b.dataset.action);});
    $('#steps').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(!b||state==='paused'||state==='conflict')return;clearTimeout(verificationTimer);current=Number(b.dataset.step);state='question';render(true);});
    $('#open-spec').onclick=()=>$('#spec-dialog').showModal();
    $('#close-spec').onclick=()=>$('#spec-dialog').close();
    $('#spec-dialog').addEventListener('click',e=>{if(e.target===$('#spec-dialog'))$('#spec-dialog').close();});
    $('#motion-toggle').onclick=()=>{motionStopped=!motionStopped;$('#motion-toggle').setAttribute('aria-pressed',String(motionStopped));$('#motion-toggle').setAttribute('aria-label',motionStopped?'Riprendi animazione':'Ferma animazione');$('#motion-label').textContent=motionStopped?'Riprendi movimento':'Ferma movimento';};
    $('#sound-toggle').onclick=()=>{
      sound=!sound;
      try{if(sound)startBed();else stopBed(false);}catch{failSound();return;}
      syncSoundControl();
    };
    document.addEventListener('visibilitychange',()=>{if(sound&&!document.hidden&&audio?.state==='suspended')void audio.resume();});
    window.addEventListener('pagehide',()=>{stopBed(true);for(const current of fadingBeds)releaseBed(current);fadingBeds.clear();void audio?.close();});
    let noticeTimer;
    function notice(text){document.querySelector('.notice')?.remove();clearTimeout(noticeTimer);const node=document.createElement('div');node.className='notice';node.role='status';node.textContent=text;document.body.append(node);noticeTimer=setTimeout(()=>node.remove(),3500);}
    $('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notice('Schermo intero non disponibile in questo browser.');}catch{notice('Il browser non consente lo schermo intero in questa finestra.');}};
    document.addEventListener('fullscreenchange',()=>{$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Esci da schermo intero':'Apri schermo intero');});
    document.addEventListener('keydown',e=>{if($('#spec-dialog').open||e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;if(state==='question'&&['1','2'].includes(e.key)){e.preventDefault();action(e.key==='1'?'conflict':'aligned');}if(e.key.toLowerCase()==='f')$('#fullscreen').click();});
    reduced.addEventListener('change',()=>{motionStopped=reduced.matches;$('#motion-toggle').setAttribute('aria-pressed',String(motionStopped));$('#motion-label').textContent=motionStopped?'Riprendi movimento':'Ferma movimento';});
    if(motionStopped){$('#motion-label').textContent='Riprendi movimento';$('#motion-toggle').setAttribute('aria-pressed','true');$('#motion-toggle').setAttribute('aria-label','Riprendi animazione');}

    // A local generative karesansui study: raked sand, slow ripples and river stones.
    // Pausing freezes the actual animation clock. No agent execution is connected.
    const canvas=$('#wallpaper'),ctx=canvas.getContext('2d');
    let w=1000,h=800,dpr=1,lastPaint=0,px=0,py=0,targetX=0,targetY=0;
    let paper=null;
    const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
    function makePaper(){
      paper=document.createElement('canvas');paper.width=320;paper.height=320;
      const pc=paper.getContext('2d');
      for(let i=0;i<6500;i++){
        pc.fillStyle=i%3===0?'rgba(255,255,248,.28)':'rgba(104,99,80,.035)';
        pc.fillRect(random(i)*320,random(i+9400)*320,i%7===0?2:1,1);
      }
    }
    makePaper();
    new ResizeObserver(entries=>{const r=entries[0].contentRect;w=r.width;h=r.height;dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=w*dpr;canvas.height=h*dpr;ctx?.setTransform(dpr,0,0,dpr,0,0);}).observe(stage);
    stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();targetX=(e.clientX-r.left)/w-.5;targetY=(e.clientY-r.top)/h-.5;});
    stage.addEventListener('pointerleave',()=>{targetX=0;targetY=0;});
    function stone(x,y,size,angle,variant){
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);
      // Soft contact shadow stays on the same sand surface.
      const shadow=ctx.createRadialGradient(size*.18,size*.26,size*.2,size*.17,size*.2,size*1.65);
      shadow.addColorStop(0,'rgba(43,45,33,.26)');shadow.addColorStop(.42,'rgba(63,64,44,.12)');shadow.addColorStop(1,'rgba(65,65,48,0)');
      ctx.fillStyle=shadow;ctx.save();ctx.scale(1.14,.72);ctx.fillRect(-size*1.9,-size*1.9,size*3.8,size*3.8);ctx.restore();
      const shape=new Path2D();shape.moveTo(-size*.95,-size*.1);
      shape.bezierCurveTo(-size*.95,-size*.72,-size*.45,-size*.91,size*.15,-size*.77);
      shape.bezierCurveTo(size*.82,-size*.76,size*1.08,-size*.35,size*.9,size*.22);
      shape.bezierCurveTo(size*.68,size*.79,-size*.05,size*.82,-size*.65,size*.48);
      shape.bezierCurveTo(-size*.9,size*.3,-size*.98,size*.15,-size*.95,-size*.1);
      const fill=ctx.createRadialGradient(-size*.36,-size*.56,0,size*.1,size*.15,size*1.6);
      fill.addColorStop(0,variant===0?'#64766a':'#5b6e60');fill.addColorStop(.35,'#344b3e');fill.addColorStop(.72,'#1e342b');fill.addColorStop(1,'#142a22');
      ctx.fillStyle=fill;ctx.fill(shape);
      ctx.save();ctx.clip(shape);
      for(let i=0;i<300;i++){
        const xx=(random(i+variant*700)-.5)*size*2.1,yy=(random(i+1234)-.5)*size*2;
        ctx.fillStyle=i%3===0?'rgba(224,224,202,.065)':'rgba(13,24,16,.05)';ctx.beginPath();ctx.arc(xx,yy,random(i+800)*1.1+.2,0,Math.PI*2);ctx.fill();
      }
      ctx.strokeStyle='rgba(205,212,189,.085)';ctx.lineWidth=.7;
      for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-size,size*(i*.18-.45));ctx.bezierCurveTo(-size*.2,size*(i*.12-.25),size*.22,size*(i*.1-.65),size,size*(i*.14-.35));ctx.stroke();}
      ctx.restore();ctx.restore();
    }
    function petal(x,y,size,rotation,opacity,seed){
      ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.scale(.6+Math.abs(Math.sin(rotation*.8))*.4,1);ctx.globalAlpha=opacity;
      const fill=ctx.createLinearGradient(-size,-size,size,size);
      fill.addColorStop(0,'#f8d6df');fill.addColorStop(.55,'#d58ba3');fill.addColorStop(1,'#ac597b');ctx.fillStyle=fill;
      ctx.beginPath();ctx.moveTo(0,size*.8);ctx.bezierCurveTo(-size*1.2,0,-size*.8,-size,0,-size*.7);ctx.bezierCurveTo(size*.9,-size*.95,size*1.15,0,0,size*.8);ctx.fill();
      ctx.strokeStyle='#ba769044';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(0,size*.7);ctx.quadraticCurveTo(-size*.1,0,seed*size*.2,-size*.5);ctx.stroke();ctx.restore();
    }
    function draw(now){
      requestAnimationFrame(draw);
      if(document.hidden)return;
      if(now-lastPaint<1000/(motionStopped||state==='paused'?8:30))return;
      const elapsed=(now-lastPaint)/1000;lastPaint=now;
      const running=!motionStopped&&state!=='paused';
      if(running)time+=Math.min(elapsed,.08);
      if(!ctx)return;
      if(running){px+=(targetX-px)*.025;py+=(targetY-py)*.025;}
      $('#sakura-branch').style.transform=`rotate(${Math.sin(time*.18)*.7}deg) translateY(${Math.sin(time*.12)*2}px)`;
      tint+=((state==='conflict'||state==='paused'?1:0)-tint)*.03;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle=ctx.createPattern(paper,'repeat');ctx.fillRect(0,0,w,h);
      const mobile=w<650;
      const unit=Math.min(w*.065,h*.078);
      const stones=[
        {x:w*.69+px*6,y:h*(mobile?.265:.30)+py*4,s:unit*1.15,angle:-.34},
        {x:w*.49+px*4,y:h*(mobile?.33:.40)+py*3,s:unit*.68,angle:.20},
        {x:w*.81+px*3,y:h*(mobile?.36:.40)+py*2,s:unit*.43,angle:-.55}
      ];
      const ink=state==='complete'?[85,112,81]:[106+Math.round(tint*50),119-Math.round(tint*40),89-Math.round(tint*27)];
      // Parallel rake paths bend around stones. Breathing is intentionally almost imperceptible.
      for(let base=36;base<h*.69;base+=5.4){
        ctx.beginPath();
        const edge=Math.sin(Math.min(1,base/(h*.7))*Math.PI);
        for(let x=-10;x<=w+12;x+=7){
          let y=base+Math.sin(x/w*5.1+time*.065+base*.008)*9;
          for(const st of stones){
            const dy=base-st.y;
            y+=Math.exp(-Math.pow((x-st.x)/(st.s*3.8),2))*Math.exp(-Math.abs(dy)/(st.s*2.7))*st.s*1.25*Math.tanh(dy/(st.s*.30));
          }
          y+=Math.sin(x*.006+base*.017-time*.12)*2.8;
          if(x===-10)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.strokeStyle=`rgba(${ink.join(',')},${.065+edge*.18})`;ctx.lineWidth=.8;ctx.stroke();
      }
      // Closed rake rings surround each stone, like quiet ripples in dry sand.
      stones.forEach((st,index)=>{
        ctx.save();ctx.translate(st.x,st.y);ctx.rotate(st.angle*.3);
        for(let ring=0;ring<18;ring++){
          const radius=st.s*1.20+ring*5.6+Math.sin(time*.11+index)*2.2;
          const alpha=.29*(1-ring/19);
          ctx.beginPath();
          for(let i=0;i<=120;i++){
            const a=i/120*Math.PI*2;
            const r=radius+Math.sin(a*3+index+time*.04)*1.2;
            const xx=Math.cos(a)*r*1.27,yy=Math.sin(a)*r*.79;
            if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
          }
          ctx.strokeStyle=`rgba(${ink.join(',')},${alpha})`;ctx.lineWidth=.8;ctx.stroke();
        }
        ctx.restore();
      });
      stones.forEach((st,i)=>stone(st.x,st.y,st.s,st.angle,i));
      // Fallen blossoms settle around the stones, while a handful drift on the breeze.
      for(let i=0;i<19;i++){
        const x=w*(.36+random(i+2001)*.58),y=h*(.22+random(i+2121)*.31);
        petal(x,y,(mobile?2.5:3.5)+random(i+2712)*2.7,random(i+2424)*Math.PI*2,.5+random(i+1511)*.3,random(i+151));
      }
      for(let i=0;i<(mobile?9:16);i++){
        const duration=30+random(i+181)*20;
        const progress=(time/duration+random(i+313))%1;
        const x=w*(.49+random(i+503)*.57-progress*.23)+Math.sin(time*.20+i*1.7)*(mobile?12:28);
        const y=-25+progress*h*.69;
        const fade=Math.min(1,progress*9)*(1-Math.max(0,(progress-.78)/.22));
        petal(x,y,(mobile?3:4)+random(i+1641)*3.8,time*(.15+random(i+229)*.15)+i,fade*.86,random(i+1022));
      }
      // A single widening ring acknowledges a decision without turning into celebration.
      const age=time-effectStart;
      if(age>=0&&age<5){
        const st=stones[0];ctx.beginPath();ctx.ellipse(st.x,st.y,st.s*(1.8+age*.42),st.s*(1.2+age*.27),0,0,Math.PI*2);
        ctx.strokeStyle=`rgba(${ink.join(',')},${(1-age/5)*.30})`;ctx.lineWidth=1;ctx.stroke();
      }
    }
    render();requestAnimationFrame(draw);
  })();
