window.socket = io({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
// Socket.IO 연결 상태 디버깅
socket.on("connect", () => {
  console.log("Socket.IO connected");
  // 대시보드 진입 시 소켓이벤트 수신을 위한 room 입장
  const nickname = window.currentUserNickname;
  if (nickname) {
    socket.emit("join_dashboard", { nickname });
    console.log("대시보드 룸 입장 요청:", nickname);
  } else {
    console.warn("currentUserNickname이 설정되지 않음");
  }
});
socket.on("connect_error", (err) => {
  console.error("Socket.IO connection error:", err);
});

socket.on("disconnect", () => {
  console.log("Socket.IO disconnected");
});