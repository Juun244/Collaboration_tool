const socket = io();
const chatInstances = new Map(); // projectId별 채팅창 관리

// DOMContentLoaded 이벤트에서 버튼 이벤트 설정
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".open-chat-btn");
  if (buttons.length === 0) {
    console.warn("No .open-chat-btn elements found");
  }
  buttons.forEach(button => {
    button.addEventListener("click", (e) => {
      e.stopPropagation(); // 프로젝트 카드 클릭 이벤트 간섭 방지
      const projectId = button.dataset.projectId;
      if (!projectId) {
        console.error("projectId not found on button:", button);
        return;
      }
      console.log("Opening chat for project:", projectId);
      openChat(projectId);
    });
  });

  const openChatBtn = document.getElementById("openChatBtn");
  if (openChatBtn) {
    openChatBtn.addEventListener("click", () => {
      console.log("Opening default chat for project1");
      openChat("project1"); // 임시로 project1 열기
    });
  } else {
    console.warn("openChatBtn not found");
  }
});

// 드래그 앤 드롭 기능
function makeDraggable(element, header) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  header.onmousedown = dragMouseDown;
    document.getElementById("chatMessages").innerHTML = ""; // 채팅창 초기화
  });
  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// 채팅창 열기
function openChat(projectId) {
  if (chatInstances.has(projectId)) {
    const chatBox = chatInstances.get(projectId).element;
    chatBox.classList.add("active");
    chatInstances.get(projectId).isMinimized = false;
    chatBox.querySelector(`.chat-body`).style.display = "flex";
    chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = "🗕";
    return;
  }

  // 새로운 채팅창 DOM 생성
  const chatBox = document.createElement("div");
  chatBox.className = "floating-chat";
  chatBox.id = `floatingChat-${projectId}`;
  chatBox.innerHTML = `
    <div class="chat-header" id="chatHeader-${projectId}">
      ${projectId} 채팅
      <div>
        <span id="minimizeChat-${projectId}">🗕</span>
        <span id="chatClose-${projectId}">✖</span>
      </div>
    </div>
    <div class="chat-body" id="chatBody-${projectId}">
      <div class="chat-messages" id="chatMessages-${projectId}"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" id="chatInput-${projectId}" placeholder="메시지를 입력..." />
        <button class="chat-send-btn" id="sendChatBtn-${projectId}">보내기</button>
      </div>
    </div>
  `;
  document.body.appendChild(chatBox);

  // 과거 메시지 수신
  socket.on("chat_history", (history) => {
    history.forEach(data => {
      appendChatMessage(data.user_id, data.username, data.message, data.timestamp);
    });
  });

  // 실시간 메시지 수신
  socket.on("message", (data) => {
    appendChatMessage(data.user_id, data.username, data.message, data.timestamp);

  // 채팅창 위치 조정
  const offset = chatInstances.size * 320;
  chatBox.style.right = `${20 + offset}px`;
  chatBox.style.bottom = "20px";

  // 채팅창 인스턴스 저장
  chatInstances.set(projectId, { element: chatBox, isMinimized: false });

  // 드래그 앤 드롭 활성화
  makeDraggable(chatBox, chatBox.querySelector(`.chat-header`));

  // 최소화/최대화 이벤트
  chatBox.querySelector(`#minimizeChat-${projectId}`).addEventListener("click", () => {
    const instance = chatInstances.get(projectId);
    instance.isMinimized = !instance.isMinimized;
    const chatBody = chatBox.querySelector(`.chat-body`);
    chatBody.style.display = instance.isMinimized ? "none" : "flex";
    chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = instance.isMinimized ? "🗖" : "🗕";
    if (instance.isMinimized) {
      chatBox.querySelector(`.chat-header`).classList.remove("new-message");
    }
  });

  // 닫기 이벤트
  chatBox.querySelector(`#chatClose-${projectId}`).addEventListener("click", () => {
    socket.emit("leave", { project_id: projectId });
    chatBox.remove();
    chatInstances.delete(projectId);
  });

  // 메시지 전송 이벤트
  chatBox.querySelector(`#sendChatBtn-${projectId}`).addEventListener("click", () => {
    const message = chatBox.querySelector(`#chatInput-${projectId}`).value.trim();
    if (!message) return;
    console.log("Sending message for project:", projectId, message);
    socket.emit("send_message", { project_id: projectId, message });
    chatBox.querySelector(`#chatInput-${projectId}`).value = "";
  });

  // 소켓 방 참여
  console.log("Joining room for project:", projectId);
  socket.emit("join", { project_id: projectId });
}

// 메시지 출력
function appendChatMessage(projectId, username, message, timestamp) {
  console.log("Appending message to project:", projectId, message);
  const chatMessages = document.getElementById(`chatMessages-${projectId}`);
  if (!chatMessages) {
    console.error(`chatMessages-${projectId} not found`);
    return;
  }
  const div = document.createElement("div");
  div.innerHTML = `<strong>${username}</strong>: ${message} <small class="text-muted">(${timestamp})</small>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // 최소화 상태면 알림 표시
  const instance = chatInstances.get(projectId);
  if (instance && instance.isMinimized) {
    const header = document.getElementById(`chatHeader-${projectId}`);
    if (header) header.classList.add("new-message");
  }
}

// 시스템 메시지 출력
function appendSystemMessage(projectId, msg) {
  console.log("Appending system message to project:", projectId, msg);
  const chatMessages = document.getElementById(`chatMessages-${projectId}`);
  if (!chatMessages) {
    console.error(`chatMessages-${projectId} not found`);
    return;
  }
  const div = document.createElement("div");
  div.classList.add("text-muted", "text-center", "my-2");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 소켓 이벤트
socket.on("chat_history", (history) => {
  console.log("Received chat history:", history);
  history.forEach(data => {
    if (data.project_id) {
      appendChatMessage(data.project_id, data.username, data.message, data.timestamp);
    } else {
      console.error("project_id missing in chat_history data:", data);
    }
  });
});

socket.on("message", (data) => {
  console.log("Received message:", data);
  if (data.project_id) {
    appendChatMessage(data.project_id, data.username, data.message, data.timestamp);
  } else {
    console.error("project_id missing in message data:", data);
  }
});

socket.on("notice", (data) => {
  console.log("Received notice:", data);
  if (data.project_id) {
    appendSystemMessage(data.project_id, data.msg);
  } else {
    console.error("project_id missing in notice data:", data);
  }
});