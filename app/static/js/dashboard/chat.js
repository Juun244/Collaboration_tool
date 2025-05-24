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

    document.getElementById("chatMessages").innerHTML = ""; // 채팅창 초기화
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
      appendChatMessage(data.user_id, data.username, data.message, data.timestamp);
    });
  });

  // 실시간 메시지 수신
  socket.on("message", (data) => {
    appendChatMessage(data.user_id, data.username, data.message, data.timestamp);
  });

  // 시스템 메시지 수신 (입장/퇴장 등)
  socket.on("notice", (data) => {
    console.log("📢 시스템 메시지 수신:", data.msg);
    appendSystemMessage(data.msg);
  });
});

// 채팅 메시지 출력
function appendChatMessage(senderId, username, message, timestamp) {
  const isMine = senderId === window.currentUser.id;

  const wrapper = document.createElement("div");
  wrapper.className = `d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'} mb-2`;

  const row = document.createElement("div");
  row.className = "d-flex align-items-end msg-row";

  const msgBox = document.createElement("div");
  msgBox.className = "msg-box";
  msgBox.style.backgroundColor = isMine ? "#fdd835" : "#ffffff";
  msgBox.style.color = "black";
  msgBox.style.maxWidth = "300px";
  msgBox.style.wordBreak = "break-word";
  msgBox.style.whiteSpace = "pre-wrap";
  msgBox.style.borderRadius = isMine ? "16px 0px 16px 16px" : "0px 16px 16px 16px";
  msgBox.style.padding = "8px 12px";
  msgBox.style.boxShadow = "0 1px 2px rgba(0,0,0,0.15)";
  msgBox.style.fontSize = "0.9rem";

  const usernameTag = document.createElement("div");
  usernameTag.textContent = username;
  usernameTag.className = "fw-bold";
  usernameTag.style.marginBottom = "2px";
  usernameTag.style.textAlign = isMine ? "right" : "left";

  const contentTag = document.createElement("div");
  contentTag.textContent = message;

  msgBox.appendChild(usernameTag);
  msgBox.appendChild(contentTag);

  const time = document.createElement("div");
  time.className = "text-muted";
  time.style.fontSize = "0.75rem";
  time.style.whiteSpace = "nowrap";
  time.style.alignSelf = "flex-end";
  time.textContent = timestamp;

  if (isMine) {
    row.appendChild(time);
    row.appendChild(msgBox);
  } else {
    row.appendChild(msgBox);
    row.appendChild(time);
  }

  wrapper.appendChild(row);
  const chatMessages = document.getElementById("chatMessages");
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 시스템 메시지 출력 (입장/퇴장 알림)
function appendSystemMessage(msg) {
  const chatMessages = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.classList.add("text-muted", "text-center", "my-2");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
