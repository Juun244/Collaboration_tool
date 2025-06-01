const chatInstances = new Map();

// DOMContentLoaded 이벤트에서 버튼 및 모달 이벤트 설정
document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".open-chat-btn");
  if (buttons.length === 0) {
    console.warn("No .open-chat-btn elements found");
  }
  buttons.forEach(button => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const projectId = button.dataset.projectId;
      const projectName = button.dataset.projectName;
      if (!projectId) {
        console.error("projectId not found on button:", button);
        return;
      }
      console.log("Opening chat for project:", projectId);
      openChat(projectId,projectName);
    });
  });

  // 모달 이벤트 감지
  const projectBoardModal = document.getElementById("projectBoardModal");
  if (projectBoardModal) {
    projectBoardModal.addEventListener("shown.bs.modal", () => {
      console.log("Modal shown, ensuring chat visibility");
      chatInstances.forEach((instance, projectId) => {
        const chatBox = instance.element;
        chatBox.style.zIndex = "10000";
        chatBox.classList.add("active");
        const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
        if (chatInput && document.activeElement.id !== `chatInput-${projectId}`) {
          setTimeout(() => {
            chatInput.focus();
            console.log(`Forced focus on chat input for ${projectId} after modal shown`);
          }, 200);
        }
        console.log(`Chat ${projectId} z-index set to 10000, classes: ${chatBox.className}`);
      });
    });
    projectBoardModal.addEventListener("hidden.bs.modal", () => {
      console.log("Modal hidden, restoring chat state");
      chatInstances.forEach((instance, projectId) => {
        const chatBox = instance.element;
        if (!instance.isMinimized) {
          chatBox.classList.add("active");
          const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
          if (chatInput) {
            setTimeout(() => {
              chatInput.focus();
              console.log(`Forced focus on chat input for ${projectId} after modal hidden`);
            }, 100);
          }
        }
      });
    });
    // 모달 클릭 시 댓글 입력 활성화
    projectBoardModal.addEventListener("click", (e) => {
      e.stopPropagation();
      const commentInput = projectBoardModal.querySelector(".comment-input");
      if (commentInput && e.target.closest(".comment-section")) {
        setTimeout(() => {
          commentInput.focus();
          console.log("Focused comment input in modal");
        }, 100);
      }
    });
    // 모달 키보드 이벤트 관리
    projectBoardModal.addEventListener("keydown", (e) => {
      if (document.activeElement.classList.contains("comment-input")) {
        console.log("Modal keydown for comment input, key:", e.key);
        e.stopPropagation();
      } else if (document.activeElement.id.startsWith("chatInput-")) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log("Modal keydown blocked for chat input, key:", e.key);
      } else {
        console.log("Modal keydown captured, no input focused, key:", e.key);
      }
    });
  } else {
    console.warn("projectBoardModal not found");
  }

  // 모달 배경 클릭 방지
  const modalBackdrop = document.querySelector(".modal-backdrop");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      e.stopPropagation();
      console.log("Modal backdrop clicked, preventing focus loss");
    });
  }
});

// 드래그 앤 드롭 기능
function makeDraggable(element, header) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  header.onmousedown = dragMouseDown;

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
function openChat(projectId,projectName) {
  if (chatInstances.has(projectId)) {
    const chatBox = chatInstances.get(projectId).element;
    chatBox.classList.add("active");
    chatBox.classList.remove("minimized");
    chatInstances.get(projectId).isMinimized = false;
    chatBox.querySelector(`.chat-body`).style.display = "flex";
    chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = "🗕";
    chatBox.style.zIndex = "10000";
    const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.readOnly = false;
      setTimeout(() => {
        chatInput.focus();
        console.log(`Forced focus on chat input for ${projectId} (restore), activeElement: ${document.activeElement.id}`);
      }, 100);
    }
    console.log(`Restored chat for project: ${projectId}, classes: ${chatBox.className}, visible: ${chatBox.style.display}`);
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
  console.log(`Created chat for project: ${projectId}, appended to body`);

  const offset = chatInstances.size * 320;
  chatBox.style.right = `${20 + offset}px`;
  chatBox.style.bottom = "20px";
  chatBox.style.zIndex = "10000";

  chatInstances.set(projectId, { element: chatBox, isMinimized: false });

  makeDraggable(chatBox, chatBox.querySelector(`.chat-header`));

  // 최소화/최대화 이벤트
  chatBox.querySelector(`#minimizeChat-${projectId}`).addEventListener("click", (e) => {
    e.stopPropagation();
    const instance = chatInstances.get(projectId);
    instance.isMinimized = !instance.isMinimized;
    const chatBody = chatBox.querySelector(`.chat-body`);
    chatBody.style.display = instance.isMinimized ? "none" : "flex";
    chatBox.classList.toggle("minimized", instance.isMinimized);
    chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = instance.isMinimized ? "🗖" : "🗕";
    if (instance.isMinimized) {
      chatBox.querySelector(`.chat-header`).classList.remove("new-message");
    }
    console.log(`Minimized state for ${projectId}: ${instance.isMinimized}`);
  });

  // 닫기 이벤트
  chatBox.querySelector(`#chatClose-${projectId}`).addEventListener("click", (e) => {
    e.stopPropagation();
    socket.emit("leave", { project_id: projectId });
    chatBox.remove();
    chatInstances.delete(projectId);
    console.log(`Closed chat for project: ${projectId}`);
  });

  // 메시지 전송 이벤트
  const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
  const sendBtn = chatBox.querySelector(`#sendChatBtn-${projectId}`);
  sendBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const message = chatInput.value.trim();
    console.log(`Send button clicked for ${projectId}, message: ${message}`);
    if (!message) return;
    socket.emit("send_message", { project_id: projectId, message }, (response) => {
      console.log(`Server response for send_message ${projectId}:`, response);
    });
    chatInput.value = "";
    chatInput.focus();
  });

  // 키보드 입력 이벤트
  chatInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.log(`Keydown event in chat input for ${projectId}, key: ${e.key}, value: ${chatInput.value}`);
    if (e.key === "Enter") {
      e.preventDefault();
      const message = chatInput.value.trim();
      console.log(`Enter key pressed for ${projectId}, message: ${message}`);
      if (!message) return;
      socket.emit("send_message", { project_id: projectId, message }, (response) => {
        console.log(`Server response for send_message ${projectId}:`, response);
      });
      chatInput.value = "";
      chatInput.focus();
    }
  });

  // 입력 필드 디버깅
  chatInput.addEventListener("focus", () => {
    console.log(`Chat input focused for ${projectId}, activeElement: ${document.activeElement.id}`);
  });
  chatInput.addEventListener("blur", () => {
    console.log(`Chat input lost focus for ${projectId}, activeElement: ${document.activeElement.id}`);
  });
  chatInput.addEventListener("click", (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    chatInput.disabled = false;
    chatInput.readOnly = false;
    setTimeout(() => {
      chatInput.focus();
      console.log(`Chat input clicked for ${projectId}, activeElement: ${document.activeElement.id}`);
    }, 100);
  });
  chatInput.addEventListener("input", (e) => {
    console.log(`Input event in chat input for ${projectId}, value: ${e.target.value}`);
  });
  chatInput.addEventListener("keypress", (e) => {
    console.log(`Keypress event in chat input for ${projectId}, key: ${e.key}, value: ${chatInput.value}`);
  });

  console.log("Joining room for project:", projectId);
  socket.emit("join", projectId , (response) => {
    console.log(`Server response for join ${projectId}:`, response);
  });
}

// 메시지 출력
function appendChatMessage(projectId, nickname, message, timestamp) {
  console.log("Appending message to project:", projectId, message);
  const chatMessages = document.getElementById(`chatMessages-${projectId}`);
  if (!chatMessages) {
    console.error(`chatMessages-${projectId} not found`);
    return;
  }
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

// 시스템 메시지 출력
function appendSystemMessage(projectId, msg) {
  console.log("Appending system message to project:", projectId, msg);
  const chatMessages = document.getElementById(`chatMessages-${projectId}`);
  if (!chatMessages) {
    //console.error(`chatMessages-${projectId} not found`);
    return;
  }
  const div = document.createElement("div");
  div.classList.add("text-muted");
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 소켓 이벤트
socket.on("chat_history", (history) => {
  console.log("Received chat history:", history);
  history.forEach(data => {
    if (data.project_id) {
      appendChatMessage(data.project_id, data.nickname, data.message, data.timestamp);
    } else {
      console.error("project_id missing in chat_history data:", data);
    }
  });
});

socket.on("message", (data) => {
  console.log("Received message:", data);
  if (data.project_id) {
    appendChatMessage(data.project_id, data.nickname, data.message, data.timestamp);
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

socket.on("error", (err) => {
  console.error("Socket.IO error:", err);
  alert(`메시지 전송 실패: ${err.msg}`);
});