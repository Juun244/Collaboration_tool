const socket = io();
let activeProjectId = null;

document.addEventListener("DOMContentLoaded", () => {
  const chatModal = document.getElementById("chatModal");

  // 채팅 모달 열릴 때
  chatModal.addEventListener("show.bs.modal", function () {
    const projectId = this.dataset.projectId;
    if (!projectId) return;

    activeProjectId = projectId;
    socket.emit("join", { project_id: projectId });
    console.log("🟢 join:", projectId);

    document.getElementById("chatMessages").innerHTML = "";  // 채팅창 초기화
  });

  // 채팅 모달 닫을 때
  chatModal.addEventListener("hidden.bs.modal", function () {
    if (activeProjectId) {
      socket.emit("leave", { project_id: activeProjectId });
      console.log("🔴 leave:", activeProjectId);
      activeProjectId = null;
    }
  });

  // 전송 버튼 클릭
  document.getElementById("sendChatBtn").addEventListener("click", () => {
    const message = document.getElementById("chatInput").value.trim();
    if (!message || !activeProjectId) return;

    socket.emit("send_message", {
      project_id: activeProjectId,
      message: message,
    });

    document.getElementById("chatInput").value = "";
  });

  // 과거 메시지 수신
  socket.on("chat_history", (history) => {
    history.forEach(data => {
      appendChatMessage(data.username, data.message, data.timestamp);
    });
  });

  // 실시간 메시지 수신
  socket.on("message", (data) => {
    appendChatMessage(data.username, data.message, data.timestamp);
  });

  // 시스템 메시지 수신 (입장/퇴장 등)
  socket.on("notice", (data) => {
    console.log("📢 시스템 메시지 수신:", data.msg);
    appendSystemMessage(data.msg);
  });
});

// 일반 채팅 메시지 출력
function appendChatMessage(username, message, timestamp) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${username}</strong>: ${message} <small class="text-muted">(${timestamp})</small>`;
  const chatMessages = document.getElementById("chatMessages");
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight; // 스크롤 자동 내리기
}

// 시스템 메시지 출력 (입장/퇴장 등)
function appendSystemMessage(msg) {
  const chatMessages = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.classList.add("text-muted");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight; // 스크롤 자동 내리기
}