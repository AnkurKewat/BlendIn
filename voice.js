let voiceStream = null;
let voiceEnabled = false;
const voicePeers = new Map();

function signalTo(playerId, signal) {
  if (!saved) return;
  post('/api/signal', { ...saved, targetId: playerId, signal }).catch(() => {});
}

function attachLocalVoiceTracks(peer) {
  if (!voiceStream) return;
  voiceStream.getAudioTracks().forEach(track => {
    if (!peer.pc.getSenders().some(sender => sender.track?.id === track.id)) {
      track.enabled = voiceEnabled;
      peer.pc.addTrack(track, voiceStream);
    }
  });
}

function createVoicePeer(playerId) {
  if (voicePeers.has(playerId)) return voicePeers.get(playerId);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  const peer = {
    pc,
    polite: saved.playerId.localeCompare(playerId) > 0,
    makingOffer: false,
    ignoreOffer: false,
  };
  voicePeers.set(playerId, peer);

  attachLocalVoiceTracks(peer);

  pc.onicecandidate = event => {
    if (event.candidate) signalTo(playerId, { type: 'candidate', candidate: event.candidate });
  };
  pc.ontrack = event => {
    let audio = document.getElementById(`audio-${playerId}`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `audio-${playerId}`;
      audio.autoplay = true;
      audio.playsInline = true;
      document.querySelector('#remoteAudio').appendChild(audio);
    }
    audio.srcObject = event.streams[0];
    audio.play().catch(() => showVoiceToast('Tap Turn mic on to enable voice audio.'));
  };
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      signalTo(playerId, { type: 'description', description: pc.localDescription });
    } catch {} finally {
      peer.makingOffer = false;
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') showVoiceToast('Voice connection failed. Try the same Wi-Fi network.');
  };
  return peer;
}

async function receiveVoiceSignal(message) {
  if (!saved || !message?.from || !message.signal) return;
  const peer = createVoicePeer(message.from);
  const { pc } = peer;
  const signal = message.signal;
  try {
    if (signal.type === 'description') {
      const collision = signal.description.type === 'offer' &&
        (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(signal.description);
      if (signal.description.type === 'offer') {
        await pc.setLocalDescription();
        signalTo(message.from, { type: 'description', description: pc.localDescription });
      }
    } else if (signal.type === 'candidate' && !peer.ignoreOffer) {
      await pc.addIceCandidate(signal.candidate);
    }
  } catch {}
}

function syncVoicePeers() {
  if (!saved || !state) return;
  for (const player of state.players) {
    if (player.id === saved.playerId) continue;
    let peer = voicePeers.get(player.id);
    if ((voiceStream || player.mic) && !peer) peer = createVoicePeer(player.id);
    if (peer) attachLocalVoiceTracks(peer);
  }
}

function showVoiceToast(message) {
  if (typeof toast === 'function') toast(message);
}

async function toggleVoice() {
  if (!saved) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    showVoiceToast('Microphone access needs HTTPS on phones and other devices.');
    return;
  }
  try {
    if (!voiceStream) {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceEnabled = true;
      syncVoicePeers();
    } else {
      voiceEnabled = !voiceEnabled;
    }
    voiceStream.getAudioTracks().forEach(track => { track.enabled = voiceEnabled; });
    await post('/api/voice', { ...saved, enabled: voiceEnabled });
    renderVoiceDock();
  } catch (error) {
    showVoiceToast(error.name === 'NotAllowedError'
      ? 'Allow microphone access in your browser to talk.'
      : 'Could not start the microphone. Check permissions and use HTTPS.');
  }
}

function renderVoiceDock() {
  const dock = document.querySelector('#voiceDock');
  if (!dock) return;
  if (!saved || !state) {
    dock.hidden = true;
    return;
  }
  dock.hidden = false;
  const active = state.players.filter(player => player.mic);
  const names = active.map(player => player.id === saved.playerId ? 'you' : player.name);
  dock.innerHTML = `<button class="voice-toggle ${voiceEnabled ? '' : 'off'}" id="voiceToggle">${voiceEnabled ? 'Mute mic' : 'Turn mic on'}</button>
    <div class="voice-meta"><div class="voice-title"><span class="voice-dot ${active.length ? 'live' : ''}"></span>Group voice${active.length ? ` · ${active.length} mic${active.length === 1 ? '' : 's'} on` : ''}</div>
    <div class="voice-people">${active.length ? `${esc(names.join(', '))} speaking` : 'Your mic is off. Turn it on to talk.'}</div></div>`;
  document.querySelector('#voiceToggle').onclick = toggleVoice;
}

function releaseVoice() {
  for (const { pc } of voicePeers.values()) pc.close();
  voicePeers.clear();
  if (voiceStream) voiceStream.getTracks().forEach(track => track.stop());
  voiceStream = null;
  voiceEnabled = false;
  document.querySelector('#remoteAudio').replaceChildren();
}

const originalRenderWithVoice = render;
render = function (...args) {
  originalRenderWithVoice(...args);
  if (!saved) releaseVoice();
  renderVoiceDock();
  syncVoicePeers();
};

const originalEntryRenderWithVoice = renderEntry;
renderEntry = function (...args) {
  originalEntryRenderWithVoice(...args);
  releaseVoice();
  renderVoiceDock();
};

const originalConnectWithVoice = connect;
connect = function (...args) {
  originalConnectWithVoice(...args);
  if (eventSource) eventSource.addEventListener('signal', event => {
    receiveVoiceSignal(JSON.parse(event.data));
  });
};

if (eventSource) eventSource.addEventListener('signal', event => receiveVoiceSignal(JSON.parse(event.data)));
renderVoiceDock();

window.addEventListener('pagehide', releaseVoice);
