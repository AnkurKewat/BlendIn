const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const avatars = ['🤪','🤡','😎','🥸','👽','🐸'];
const rooms = new Map();
const wordPairs = [
  ['Tea','Coffee'],['Beach','Pool'],['Cat','Dog'],['Apple','Orange'],['Train','Bus'],['Pancake','Waffle'],['Moon','Sun'],['Shark','Dolphin'],['Pizza','Burger'],['Rain','Snow'],['Book','Magazine'],['Guitar','Piano'],['Castle','Palace'],['Airplane','Helicopter'],['Sofa','Bed'],['Bicycle','Motorcycle'],['Forest','Jungle'],['Popcorn','Chips'],['Robot','Alien'],['Volcano','Earthquake'],['Socks','Shoes'],['River','Lake'],['Candle','Flashlight'],['Doctor','Nurse'],['Tennis','Badminton'],['Cookie','Brownie'],['Sailboat','Ferry'],['Crocodile','Alligator'],['Crown','Tiara'],['Desert','Beach']
];
const uid = () => crypto.randomBytes(9).toString('hex');
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
function publicState(room, playerId) {
  const me = room.players.find(p => p.id === playerId);
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, round: room.round, rounds: room.rounds,
    players: room.players.map(p => ({id:p.id,name:p.name,avatar:p.avatar,score:p.score,ready:p.ready,roundReady:!!p.roundReady,mic:!!p.mic,clue: room.phase === 'clue' || room.phase === 'vote' || room.phase === 'reveal' || room.phase === 'score' ? p.clue : undefined, voted: !!p.vote})),
    me: me ? {id:me.id,name:me.name,role: room.phase === 'intro' || room.phase === 'clue' || room.phase === 'vote' || room.phase === 'duel' ? me.role : undefined, word: room.phase === 'intro' || room.phase === 'clue' || room.phase === 'vote' || room.phase === 'duel' ? (me.role === 'imposter' ? room.imposterWord : room.word) : undefined, roundReady:!!me.roundReady,clue:me.clue,hasVoted:!!me.vote} : null,
    word: room.phase === 'reveal' || room.phase === 'score' ? room.word : undefined,
    imposterWord: room.phase === 'reveal' || room.phase === 'score' ? room.imposterWord : undefined,
    imposterId: room.phase === 'reveal' || room.phase === 'score' ? room.imposterId : undefined,
    winner:room.winner, message:room.message, duel: room.players.length === 2,
  };
}
const clients = new Map();
function sendRoom(room) { for (const [res, info] of clients) if (info.code === room.code) { try { res.write(`data: ${JSON.stringify(publicState(room, info.playerId))}\n\n`); } catch {} } }
function response(res, status, data) { res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); }
function roomFor(body) { return rooms.get(String(body.code || '').toUpperCase()); }
function startRound(room) {
  const selected = wordPairs[Math.floor(Math.random() * wordPairs.length)];
  const swapped = Math.random() < 0.5; room.word = selected[swapped ? 1 : 0]; room.imposterWord = selected[swapped ? 0 : 1]; room.imposterId = room.players[Math.floor(Math.random()*room.players.length)].id;
  room.players.forEach(p => { p.role = p.id === room.imposterId ? 'imposter' : 'player'; p.clue=''; p.vote=''; p.roundReady=false; });
  room.phase='intro'; room.message='Check your private role and word. The round begins when everyone is ready.'; room.winner='';
}
function nextRound(room) { room.round++; if (room.round > room.rounds) { room.phase='score'; room.message='Game complete'; return; } startRound(room); }
function act(body) {
  const room = roomFor(body); if (!room) throw Error('Room not found. Check the code and try again.');
  const player = room.players.find(p => p.id === body.playerId); if (!player) throw Error('Player not found in this room.');
  if (body.action === 'ready') { player.ready=true; }
  else if (body.action === 'start') {
    if (room.hostId !== player.id) throw Error('Only the host can start the game.');
    if (room.players.length < 2) throw Error('Invite at least one more player to start.');
    room.round=1; startRound(room);
  } else if (body.action === 'readyRound') {
    if(room.phase!=='intro') throw Error('The role check is closed.');
    player.roundReady=true;
    if(room.players.every(p=>p.roundReady)){room.phase='clue';room.message='Share one clue for your word. Clues appear to everyone as soon as they are submitted.';}
  } else if (body.action === 'clue') {
    if (room.phase !== 'clue') throw Error('Clue round is over.');
    const clue=String(body.clue || '').trim().slice(0,80); if (!clue) throw Error('Write a clue first.');
    player.clue=clue;
    if (room.players.every(p => p.clue)) { room.phase=room.players.length===2?'duel':'vote'; room.message=room.players.length===2?'Imposter: guess the secret word from the clues.':'Clues are in. Talk it out, then vote.'; }
  } else if (body.action === 'duelGuess') {
    if(room.phase!=='duel' || player.id!==room.imposterId) throw Error('Only the imposter can make the duel guess.');
    const correct=String(body.guess||'').trim().toLowerCase()===room.word.toLowerCase();
    if(correct){player.score+=2;room.winner='imposter';room.message='Correct guess! The imposter wins the duel and earns 2 points.';}
    else {room.players.find(p=>p.id!==room.imposterId).score+=1;room.winner='group';room.message=`Wrong guess. ${room.players.find(p=>p.id!==room.imposterId).name} wins the duel and earns 1 point.`;}
    room.phase='reveal';
  } else if (body.action === 'vote') {
    if (room.phase !== 'vote') throw Error('Voting is not open.');
    if (!room.players.some(p=>p.id===body.targetId)) throw Error('Choose a player.'); player.vote=body.targetId;
    if (room.players.every(p=>p.vote)) {
      const counts={}; room.players.forEach(p=>counts[p.vote]=(counts[p.vote]||0)+1);
      const max=Math.max(...Object.values(counts)); const leaders=Object.keys(counts).filter(id=>counts[id]===max);
      if (room.players.length===2) {
        const imposterFound = leaders.length === 1 && leaders[0] === room.imposterId;
        room.winner=imposterFound ? 'group' : 'imposter';
        if (imposterFound) { room.players.filter(p=>p.id!==room.imposterId).forEach(p=>p.score+=1); room.message='The group spotted the imposter!'; }
        else { room.players.find(p=>p.id===room.imposterId).score+=2; room.message='The imposter blended in and wins the duel!'; }
      } else if (leaders.length !== 1) { room.winner='imposter'; room.players.find(p=>p.id===room.imposterId).score+=2; room.message='It’s a tie. The imposter slips away!'; }
      else if (leaders[0]===room.imposterId) { room.winner='group'; room.players.filter(p=>p.id!==room.imposterId).forEach(p=>p.score+=1); room.message='The group found the imposter!'; }
      else { room.winner='imposter'; room.players.find(p=>p.id===room.imposterId).score+=2; room.message='Wrong suspect. The imposter gets away!'; }
      room.phase='reveal';
    }
  } else if (body.action === 'guess') {
    if (room.phase!=='reveal' || player.id!==room.imposterId) throw Error('Only the revealed imposter can guess now.');
    if (String(body.guess||'').trim().toLowerCase()===room.word.toLowerCase()) { player.score+=2; room.message='Correct guess! The imposter steals 2 points.'; } else room.message=`Not quite—the word was ${room.word}.`;
    room.phase='score';
  } else if (body.action === 'next') {
    if (room.hostId!==player.id) throw Error('Only the host can continue.'); nextRound(room);
  }
  sendRoom(room); return publicState(room,player.id);
}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET' && url.pathname==='/events') {
    const code=url.searchParams.get('code')?.toUpperCase(), playerId=url.searchParams.get('playerId'), room=rooms.get(code);
    if(!room||!room.players.some(p=>p.id===playerId)){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    const info={code,playerId}; clients.set(res,info); res.write(`data: ${JSON.stringify(publicState(room,playerId))}\n\n`); req.on('close',()=>{clients.delete(res);if(![...clients.values()].some(c=>c.code===code&&c.playerId===playerId)){const p=room.players.find(p=>p.id===playerId);if(p?.mic){p.mic=false;sendRoom(room);}}}); return;
  }
  if(req.method==='GET' && url.pathname==='/api/session') { const room=rooms.get(String(url.searchParams.get('code')||'').toUpperCase()), playerId=url.searchParams.get('playerId'); if(!room||!room.players.some(p=>p.id===playerId))return response(res,404,{error:'Room session ended'}); return response(res,200,{ok:true}); }
  if(req.method==='GET' && url.pathname==='/voice.js') { const file=path.join(__dirname,'voice.js');res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);return; }
  if(req.method==='GET' && url.pathname==='/clue-alerts.js') { const file=path.join(__dirname,'clue-alerts.js');res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);return; }
  if(req.method==='GET' && url.pathname==='/') { const file=path.join(__dirname,'index.html'); res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); fs.createReadStream(file).pipe(res); return; }
  if(req.method==='GET' && url.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('Blend In is running');return;}
  if(req.method==='POST') { let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{try{const body=JSON.parse(raw||'{}'); if(url.pathname==='/api/create'){
      const c=code(), id=uid(), name=String(body.name||'Player 1').trim().slice(0,20)||'Player 1', avatar=avatars.includes(body.avatar)?body.avatar:avatars[0]; const room={code:c,hostId:id,phase:'lobby',round:0,rounds:5,players:[{id,name,avatar,score:0,ready:true,clue:'',vote:''}],word:'',category:'',imposterId:'',winner:'',message:'Waiting for players to join…'}; rooms.set(c,room); return response(res,200,{code:c,playerId:id,state:publicState(room,id)});
    } if(url.pathname==='/api/join') { const room=roomFor(body); if(!room)return response(res,404,{error:'Room not found. Check the code and try again.'}); if(room.phase!=='lobby')return response(res,409,{error:'This game has already started.'}); if(room.players.length>=8)return response(res,409,{error:'This room is full (8 players max).'}); const name=String(body.name||'Player').trim().slice(0,20)||'Player'; if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return response(res,409,{error:'That name is already taken in this room.'}); const id=uid(), avatar=avatars.includes(body.avatar)?body.avatar:avatars[0]; room.players.push({id,name,avatar,score:0,ready:true,clue:'',vote:''}); sendRoom(room); return response(res,200,{code:room.code,playerId:id,state:publicState(room,id)});
    } if(url.pathname==='/api/action') { try{return response(res,200,{state:act(body)});}catch(e){return response(res,400,{error:e.message});} }
    if(url.pathname==='/api/voice') { const room=roomFor(body),player=room?.players.find(p=>p.id===body.playerId);if(!player)return response(res,404,{error:'Player or room not found'});player.mic=!!body.enabled;sendRoom(room);return response(res,200,{ok:true}); }
    if(url.pathname==='/api/signal') { const room=roomFor(body),sender=room?.players.find(p=>p.id===body.playerId),target=room?.players.find(p=>p.id===body.targetId);if(!sender||!target)return response(res,404,{error:'Player or room not found'});if(!body.signal||!['description','candidate'].includes(body.signal.type))return response(res,400,{error:'Invalid voice signal'});const payload=JSON.stringify({from:sender.id,signal:body.signal});for(const [stream,info] of clients)if(info.code===room.code&&info.playerId===target.id){try{stream.write(`event: signal\ndata: ${payload}\n\n`)}catch{}}return response(res,200,{ok:true}); }
    return response(res,404,{error:'Not found'});
  }catch(e){return response(res,400,{error:e.message});}}); return; }
  res.writeHead(404);res.end('Not found');
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Blend In running at http://localhost:${PORT}`));
