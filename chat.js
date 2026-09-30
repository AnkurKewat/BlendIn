let chatRoomKey = '';
let chatExpanded = false;
let chatMessageSignature = '';
let chatKnownMessageIds = new Set();
let chatHasInitialSnapshot = false;

function renderChat() {
  const panel = document.querySelector('#chatPanel');
  const toggle = document.querySelector('#chatToggle');
  const shell = document.querySelector('.shell');
  if (!panel || !toggle || !shell) return;

  const inRoom = !!(saved && state);
  const mobile = window.matchMedia('(max-width: 1000px)').matches;
  shell.classList.toggle('chat-open', inRoom && !mobile);
  toggle.hidden = !inRoom;
  toggle.textContent = `💬 Chat${state?.chat?.length ? ` · ${state.chat.length}` : ''}`;

  if (!inRoom) {
    panel.hidden = true;
    panel.classList.remove('open');
    chatRoomKey = '';
    chatMessageSignature = '';
    chatExpanded = false;
    return;
  }

  const roomKey = `${saved.code}:${saved.playerId}`;
  if (roomKey !== chatRoomKey) {
    chatRoomKey = roomKey;
    chatExpanded = false;
    chatMessageSignature = '';
    chatKnownMessageIds = new Set();
    chatHasInitialSnapshot = false;
    panel.innerHTML = `<div class="chat-head"><div><div class="chat-title">Group chat</div><div class="chat-count">Messages stay in this room</div></div></div>
      <div class="chat-messages" id="chatMessages" aria-live="polite"></div>
      <form class="chat-form" id="chatForm"><input class="chat-input" id="chatInput" maxlength="300" placeholder="Message the group…" autocomplete="off" aria-label="Chat message"><button class="chat-send" type="submit">Send</button></form>`;
    panel.querySelector('#chatForm').addEventListener('submit', async event => {
      event.preventDefault();
      const input = panel.querySelector('#chatInput');
      const text = input.value.trim();
      if (!text || !saved) return;
      try {
        await post('/api/chat', { ...saved, text });
        input.value = '';
        input.focus();
      } catch (error) {
        toast(error.message || 'Could not send the message.');
      }
    });
  }

  const messages = state.chat || [];
  const hasNewClue = chatHasInitialSnapshot && messages.some(message => message.type === 'clue' && message.playerId !== saved.playerId && !chatKnownMessageIds.has(message.id));
  if (mobile && hasNewClue) chatExpanded = true;
  panel.hidden = mobile && !chatExpanded;
  panel.classList.toggle('open', mobile && chatExpanded);
  const signature = messages.map(message => message.id).join('|');
  if (signature !== chatMessageSignature) {
    const list = panel.querySelector('#chatMessages');
    const shouldScroll = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 70;
    list.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.textContent = 'Say hello to the group. Your messages will appear here for everyone.';
      list.append(empty);
    } else {
      for (const message of messages) {
        const row = document.createElement('article');
        row.className = `chat-message${message.playerId === saved.playerId ? ' mine' : ''}${message.type === 'clue' ? ' clue-alert' : ''}`;
        const avatar = document.createElement('span');
        avatar.className = 'chat-avatar';
        avatar.textContent = message.avatar || '😎';
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        const meta = document.createElement('div');
        meta.className = 'chat-meta';
        const name = document.createElement('span');
        name.className = 'chat-name';
        name.textContent = message.type === 'clue' ? `${message.name} shared a clue` : message.playerId === saved.playerId ? 'You' : message.name;
        const time = document.createElement('time');
        time.className = 'chat-time';
        time.textContent = new Date(message.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const text = document.createElement('div');
        text.className = 'chat-text';
        text.textContent = message.type === 'clue' ? `“${message.text}”` : message.text;
        meta.append(name, time);
        bubble.append(meta, text);
        row.append(avatar, bubble);
        list.append(row);
      }
    }
    if (shouldScroll) list.scrollTop = list.scrollHeight;
    chatMessageSignature = signature;
  }
  messages.forEach(message => chatKnownMessageIds.add(message.id));
  chatHasInitialSnapshot = true;
}

document.querySelector('#chatToggle')?.addEventListener('click', () => {
  chatExpanded = !chatExpanded;
  renderChat();
  if (chatExpanded) document.querySelector('#chatInput')?.focus();
});

window.addEventListener('resize', renderChat);

const renderWithChat = render;
render = function (...args) {
  renderWithChat(...args);
  renderChat();
};

renderChat();
