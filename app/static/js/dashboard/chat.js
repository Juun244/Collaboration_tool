const chatInstances = new Map();
let isChatInitialized = false;

window.initializeChat = function () {
  if (isChatInitialized) {
    console.log("채팅이 이미 초기화되어 있습니다.");
    return;
  }

  console.log("initializeChat 호출됨");

  // Modal 이벤트 리스너
  document.addEventListener("DOMContentLoaded", () => {
    const projectBoardModal = document.getElementById("projectBoardModal");
    if (projectBoardModal) {
      projectBoardModal.addEventListener("shown.bs.modal", () => {
        chatInstances.forEach((instance, projectId) => {
          const chatBox = instance.element;
          chatBox.style.zIndex = "10000";
          chatBox.classList.add("active");
          const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
          if (chatInput && document.activeElement.id !== `chatInput-${projectId}`) {
            setTimeout(() => chatInput.focus(), 200);
          }
        });
      });

      projectBoardModal.addEventListener("hidden.bs.modal", () => {
        chatInstances.forEach((instance, projectId) => {
          const chatBox = instance.element;
          if (!instance.isMinimized) {
            chatBox.classList.add("active");
            const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
            if (chatInput) {
              setTimeout(() => chatInput.focus(), 100);
            }
          }
        });
      });

      projectBoardModal.addEventListener("click", (e) => {
        e.stopPropagation();
        const commentInput = projectBoardModal.querySelector(".comment-input");
        if (commentInput && e.target.closest(".comment-section")) {
          setTimeout(() => commentInput.focus(), 100);
        }
      });

      projectBoardModal.addEventListener("keydown", (e) => {
        if (document.activeElement.classList.contains("comment-input")) {
          e.stopPropagation();
        } else if (document.activeElement.id.startsWith("chatInput-")) {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      });
    }

    const modalBackdrop = document.querySelector(".modal-backdrop");
    if (modalBackdrop) {
      modalBackdrop.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }
  });

  // Socket 이벤트 설정
  socket.on("chat_history", (history) => {
    history.forEach(data => {
      if (data.project_id) {
        appendChatMessage(data.project_id, data.nickname, data.message, data.timestamp);
      }
    });
  });

  socket.on("message", (data) => {
    if (data.project_id) {
      appendChatMessage(data.project_id, data.nickname, data.message, data.timestamp);
    }
  });

  socket.on("notice", (data) => {
    if (data.project_id) {
      appendSystemMessage(data.project_id, data.msg || data.message);
    }
  });

  socket.on("error", (err) => {
    alert(`메시지 전송 실패: ${err.msg}`);
  });

  isChatInitialized = true;
  console.log("채팅 초기화 완료");
};

// openChat 커스텀 이벤트 리스너 등록
document.addEventListener("openChat", (e) => {
  const { projectId, projectName } = e.detail;
  console.log("CustomEvent openChat 수신:", projectId, projectName);
  openChat(projectId, projectName);
});

function makeDraggable(element, header) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  header.addEventListener("mousedown", dragMouseDown);
  header.addEventListener("touchstart", dragTouchStart, { passive: false });

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.addEventListener("mouseup", closeDragElement);
    document.addEventListener("mousemove", elementDrag);
  }

  function dragTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    document.addEventListener("touchend", closeDragElement, { passive: false });
    document.addEventListener("touchmove", elementDragTouch, { passive: false });
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

  function elementDragTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    pos1 = pos3 - touch.clientX;
    pos2 = pos4 - touch.clientY;
    pos3 = touch.clientX;
    pos4 = touch.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function closeDragElement() {
    document.removeEventListener("mouseup", closeDragElement);
    document.removeEventListener("mousemove", elementDrag);
    document.removeEventListener("touchend", closeDragElement);
    document.removeEventListener("touchmove", elementDragTouch);
  }
}

function openChat(projectId, projectName) {
  if (chatInstances.has(projectId)) {
    const chatBox = chatInstances.get(projectId).element;
    chatBox.classList.add("active");
    chatBox.classList.remove("minimized");
    chatBox.querySelector(".chat-body").style.display = "flex";
    chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = "🗕";
    chatBox.style.zIndex = "10000";
    const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.readOnly = false;
      setTimeout(() => chatInput.focus(), 100);
    }
    return;
  }

  const chatBox = document.createElement("div");
  chatBox.className = "floating-chat active";
  chatBox.id = `floatingChat-${projectId}`;
  chatBox.innerHTML = `
    <div class="chat-header" id="chatHeader-${projectId}">
      ${projectName || projectId} 채팅
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

  const offset = chatInstances.size * 320;
  chatBox.style.right = `${20 + offset}px`;
  chatBox.style.bottom = "20px";
  chatBox.style.zIndex = "10000";

  chatInstances.set(projectId, { element: chatBox, isMinimized: false });

  makeDraggable(chatBox, chatBox.querySelector(".chat-header"));

  // 최소화 버튼 이벤트 (클릭 + 터치)
  const minimizeBtn = chatBox.querySelector(`#minimizeChat-${projectId}`);
  minimizeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMinimize(projectId);
  });
  minimizeBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMinimize(projectId);
  }, { passive: false });

  // 닫기 버튼 이벤트 (클릭 + 터치)
  const closeBtn = chatBox.querySelector(`#chatClose-${projectId}`);
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeChat(projectId, chatBox);
  });
  closeBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeChat(projectId, chatBox);
  }, { passive: false });

  const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
  const sendBtn = chatBox.querySelector(`#sendChatBtn-${projectId}`);

  sendBtn.addEventListener("click", () => {
    sendMessage(projectId, chatInput);
  });
  sendBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sendMessage(projectId, chatInput);
  }, { passive: false });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage(projectId, chatInput);
    }
  });

  socket.emit("join", projectId);
}

function toggleMinimize(projectId) {
  const instance = chatInstances.get(projectId);
  if (!instance) return;
  const chatBox = instance.element;
  instance.isMinimized = !instance.isMinimized;
  const chatBody = chatBox.querySelector(".chat-body");
  chatBody.style.display = instance.isMinimized ? "none" : "flex";
  chatBox.classList.toggle("minimized", instance.isMinimized);
  const minimizeBtn = chatBox.querySelector(`#minimizeChat-${projectId}`);
  minimizeBtn.textContent = instance.isMinimized ? "🗖" : "🗕";
}

function closeChat(projectId, chatBox) {
  socket.emit("leave", { project_id: projectId });
  chatBox.remove();
  chatInstances.delete(projectId);
}

function sendMessage(projectId, chatInput) {
  const message = chatInput.value.trim();
  if (!message) return;
  socket.emit("send_message", { project_id: projectId, message });
  chatInput.value = "";
  chatInput.focus();
}

function appendChatMessage(projectId, nickname, message, timestamp) {
  const chatMessages = document.getElementById(`chatMessages-${projectId}`);
  if (!chatMessages) return;
  const div = document.createElement("div");
  const color = (nickname === window.currentUserNickname) ? "green" : "black";
  div.innerHTML = `<strong style="color:${color}">${nickname}</strong>: ${message} <small class="text-muted">(${timestamp})</small>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const instance = chatInstances.get(projectId);
  if (instance && instance.isMinimized) {
    const header = document.getElementById(`chatHeader-${projectId}`);
    if (header) header.classList.add("new-message");
  }
}

function appendSystemMessage(projectId, msg) {
  const chatMessages = document.getElementById(`chatMessages-${projectId}`);
  if (!chatMessages) return;
  const div = document.createElement("div");
  div.classList.add("text-muted");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
