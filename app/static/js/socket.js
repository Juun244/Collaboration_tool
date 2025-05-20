let socket = null;

export function initializeSocket(projectId) {
  socket = io();  // 기본 네임스페이스 연결

  socket.on('connect', () => {
    console.log('✅ Socket connected');
    if (projectId) {
      socket.emit('join_project', { project_id: projectId });
    }
  });

  socket.on('card_created', (data) => {
    console.log('📦 카드 생성 수신:', data);
    loadCards(); // cards.js 함수
  });

  socket.on('card_updated', (data) => {
    console.log('✏️ 카드 수정 수신:', data);
    loadCards();
  });

  socket.on('card_deleted', (data) => {
    console.log('🗑️ 카드 삭제 수신:', data);
    loadCards();
  });

  socket.on('card_moved', (data) => {
    console.log('📥 카드 이동 수신:', data);
    loadCards();
  });
}

export function emitCardCreated(card) {
  socket.emit('card_created', card);
}

export function emitCardUpdated(card) {
  socket.emit('card_updated', card);
}

export function emitCardDeleted(card) {
  socket.emit('card_deleted', card);
}

export function emitCardMoved(data) {
  socket.emit('card_moved', data);
}
