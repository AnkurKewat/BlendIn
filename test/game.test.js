const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const testDataRoot = path.join(__dirname, '..', 'data');
fs.mkdirSync(testDataRoot, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(testDataRoot, 'test-'));
const oldDataDir = process.env.BLEND_IN_DATA_DIR;
process.env.BLEND_IN_DATA_DIR = dataDir;
const { act, iceServersFor, publicState, restoreRooms, rooms } = require('../server');
let nextRoomNumber = 1;

after(() => {
  rooms.clear();
  if (oldDataDir === undefined) delete process.env.BLEND_IN_DATA_DIR;
  else process.env.BLEND_IN_DATA_DIR = oldDataDir;
  if (path.dirname(dataDir) === testDataRoot && path.basename(dataDir).startsWith('test-')) fs.rmSync(dataDir, { recursive: true, force: true });
});

function makeRoom(count) {
  const code = `TEST${nextRoomNumber++}`;
  const players = Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    avatar: '😎',
    score: 0,
    ready: true,
    roundReady: false,
    mic: false,
    clue: '',
    vote: '',
  }));
  const room = {
    code,
    hostId: players[0].id,
    phase: 'lobby',
    round: 0,
    rounds: 5,
    players,
    chat: [],
    lastActivityAt: Date.now(),
    word: '',
    imposterWord: '',
    imposterId: '',
    winner: '',
    message: '',
  };
  rooms.set(code, room);
  return room;
}

function doAction(room, player, action, extra = {}) {
  return act({ code: room.code, playerId: player.id, action, ...extra });
}

test('two-player clues stay visible and submitted clues are locked', () => {
  const room = makeRoom(2);
  const [host, guest] = room.players;
  const lobby = publicState(room, host.id);
  assert.equal(lobby.me.role, undefined);
  assert.equal(lobby.me.word, undefined);

  doAction(room, host, 'start');
  assert.throws(() => doAction(room, host, 'start'), /already started/i);
  const hostReady = doAction(room, host, 'readyRound');
  const guestReady = doAction(room, guest, 'readyRound');
  assert.ok(hostReady.me.role);
  assert.equal(Object.hasOwn(hostReady.players[1], 'role'), false);
  assert.ok(guestReady.me.role);
  assert.equal(guestReady.phase, 'clue');

  doAction(room, host, 'clue', { clue: 'warm drink' });
  assert.throws(() => doAction(room, host, 'clue', { clue: 'changed clue' }), /already locked/i);
  const duel = doAction(room, guest, 'clue', { clue: 'morning cup' });
  assert.equal(duel.phase, 'duel');
  assert.deepEqual(duel.players.map(player => player.clue), ['warm drink', 'morning cup']);
  const savedRooms = JSON.parse(fs.readFileSync(path.join(dataDir, 'rooms.json'), 'utf8'));
  assert.ok(savedRooms.rooms.some(savedRoom => savedRoom.code === room.code));
});

test('escaped imposters cannot take the caught-player bonus', () => {
  const room = makeRoom(4);
  const [host, ...players] = room.players;
  doAction(room, host, 'start');
  assert.throws(() => doAction(room, host, 'next'), /round is not ready/i);
  const readyStates = room.players.map(player => doAction(room, player, 'readyRound'));
  assert.equal(readyStates.at(-1).phase, 'clue');
  const imposterIndex = readyStates.findIndex(state => state.me.role === 'imposter');
  assert.notEqual(imposterIndex, -1);

  room.players.forEach((player, index) => doAction(room, player, 'clue', { clue: `clue ${index}` }));
  const imposter = room.players[imposterIndex];
  const nonImposters = room.players.filter((_, index) => index !== imposterIndex);
  const target = nonImposters[0];
  assert.throws(() => doAction(room, target, 'vote', { targetId: target.id }), /choose another player/i);
  for (const player of room.players) {
    const targetId = player.id === target.id ? nonImposters[1].id : target.id;
    doAction(room, player, 'vote', { targetId });
  }
  assert.equal(publicState(room, imposter.id).winner, 'imposter');
  assert.throws(() => doAction(room, imposter, 'guess', { guess: room.word }), /caught imposter/i);
});

test('caught imposter receives one final word guess', () => {
  const room = makeRoom(3);
  const [host] = room.players;
  doAction(room, host, 'start');
  const readyStates = room.players.map(player => doAction(room, player, 'readyRound'));
  const imposterIndex = readyStates.findIndex(state => state.me.role === 'imposter');
  const imposter = room.players[imposterIndex];
  room.players.forEach((player, index) => doAction(room, player, 'clue', { clue: `clue ${index}` }));
  for (const player of room.players) {
    const targetId = player.id === imposter.id ? room.players.find(other => other.id !== imposter.id).id : imposter.id;
    doAction(room, player, 'vote', { targetId });
  }
  assert.equal(publicState(room, imposter.id).winner, 'group');
  assert.throws(() => doAction(room, host, 'next'), /final guess/i);
  const result = doAction(room, imposter, 'guess', { guess: room.word });
  assert.equal(result.phase, 'score');
  assert.equal(result.players.find(player => player.id === imposter.id).score, 2);
  assert.throws(() => doAction(room, imposter, 'guess', { guess: room.word }), /final guess/i);
  assert.equal(doAction(room, host, 'next').round, 2);
});

test('TURN credentials are short-lived and derived from the shared secret', () => {
  const oldUrls = process.env.BLEND_IN_TURN_URLS;
  const oldSecret = process.env.BLEND_IN_TURN_SECRET;
  process.env.BLEND_IN_TURN_URLS = 'turn:relay.example:3478?transport=udp,turns:relay.example:5349?transport=tcp';
  process.env.BLEND_IN_TURN_SECRET = 'test-shared-secret';
  try {
    const [stun, turn] = iceServersFor('player-test');
    assert.match(stun.urls, /^stun:/);
    assert.equal(turn.urls.length, 2);
    const [expires, playerId] = turn.username.split(':');
    assert.equal(playerId, 'player-test');
    assert.ok(Number(expires) > Math.floor(Date.now() / 1000));
    const expected = crypto.createHmac('sha1', 'test-shared-secret').update(turn.username).digest('base64');
    assert.equal(turn.credential, expected);
  } finally {
    if (oldUrls === undefined) delete process.env.BLEND_IN_TURN_URLS;
    else process.env.BLEND_IN_TURN_URLS = oldUrls;
    if (oldSecret === undefined) delete process.env.BLEND_IN_TURN_SECRET;
    else process.env.BLEND_IN_TURN_SECRET = oldSecret;
  }
});

test('a valid but empty saved-room file does not crash startup recovery', () => {
  rooms.clear();
  fs.writeFileSync(path.join(dataDir, 'rooms.json'), 'null', 'utf8');
  assert.doesNotThrow(() => restoreRooms());
  assert.equal(rooms.size, 0);
});
