window.socket = io();
// Socket.IO 연결 상태 디버깅
socket.on("connect", () => {
  console.log("Socket.IO connected");
});
socket.on("connect_error", (err) => {
  console.error("Socket.IO connection error:", err);
});