window.socket = io();
// Socket.IO 연결 상태 디버깅
socket.on("connect", () => {
  console.log("Socket.IO connected");
  // 대시보드 진입 시 소켓이벤트 수신을 위한 room 입장
  const nickname = window.currentUserNickname;
  socket.emit("join_dashboard", { nickname });
});
socket.on("connect_error", (err) => {
  console.error("Socket.IO connection error:", err);
});