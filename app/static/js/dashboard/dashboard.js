/* dashboard.js */
const socket = io();
const chatInstances = new Map();
let isDashboardInitialized = false;
let dragged = null;
let dragClone = null;
let dragTimer = null;
let isDragging = false;
let wasDragging = false;
let startX = 0;
let startY = 0;
let scrollAnimationFrame = null;
let draggedCard = null;
let placeholder = null;
window.currentProjectId = null;
window.selectedProjectId = null;
const currentUser = window.currentUser || { id: "", nickname: "Guest" };

// 대시보드 초기화
function initializeDashboard() {
  if (isDashboardInitialized) {
    console.log("대시보드가 이미 초기화되었습니다.");
    return;
  }
  console.log("대시보드 초기화 시작");

  // 사이드바 토글
  const sidebar = document.getElementById("sidebarMenu");
  const toggleButton = document.getElementById("menuToggle");
  const closeButton = document.getElementById("menuClose");
  function toggleSidebar() {
    sidebar.classList.toggle("sidebar-closed");
    sidebar.classList.toggle("sidebar-open");
    toggleButton.style.display = sidebar.classList.contains("sidebar-open") ? "none" : "block";
    closeButton.style.display = sidebar.classList.contains("sidebar-open") ? "block" : "none";
  }
  toggleButton?.addEventListener("click", toggleSidebar);
  closeButton?.addEventListener("click", toggleSidebar);

  // 초대 목록 토글
  const invitationToggle = document.getElementById("toggleInvitations");
  const invitationList = document.getElementById("invitationList");
  invitationToggle?.addEventListener("click", () => {
    invitationList.style.display = invitationList.style.display === "none" ? "block" : "none";
    invitationToggle.querySelector("i").classList.toggle("bi-chevron-down");
    invitationToggle.querySelector("i").classList.toggle("bi-chevron-up");
  });

  // 히스토리 토글
  const historyToggle = document.getElementById("history-toggle");
  const historyList = document.getElementById("history-list");
  const historyArrow = document.getElementById("history-arrow");
  historyToggle?.addEventListener("click", () => {
    historyList.classList.toggle("open");
    historyArrow.classList.toggle("bi-caret-right-fill");
    historyArrow.classList.toggle("bi-caret-down-fill");
  });

  // 드래그 앤 드롭 초기화
  initializeDragAndDropEvents();

  // 검색 디바운스 함수
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // 검색 모달 초기화
  const searchButton = document.querySelector('[data-bs-target="#searchModal"]');
  const searchModal = document.getElementById("searchModal");
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");
  const dueDateInput = document.getElementById("dueDateInput");
  const searchResults = document.getElementById("searchResults");
  searchButton?.addEventListener("click", () => console.log("검색 버튼 클릭, 검색 모달 열기"));
  searchModal?.addEventListener("shown.bs.modal", () => {
    setTimeout(() => {
      searchInput.focus();
      console.log("검색 모달 표시, searchInput에 포커스");
    }, 50);
    searchInput.value = "";
    searchResults.innerHTML = '<p class="text-muted">키워드를 입력하세요.</p>';
  });

  async function performSearch(keyword) {
    try {
      if (!keyword.trim()) {
        searchResults.innerHTML = '<p class="text-muted">키워드를 입력하세요.</p>';
        return;
      }
      const response = await fetch(`/api/projects/search?keyword=${encodeURIComponent(keyword)}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      console.log("검색 결과:", data);
      renderResults(data);
    } catch (error) {
      console.error("검색 오류:", error);
      searchResults.innerHTML = '<p class="text-danger">검색 중 오류가 발생했습니다.</p>';
    }
  }

  function renderResults(data) {
    searchResults.innerHTML = "";
    if (!data.projects?.length && !data.cards?.length) {
      searchResults.innerHTML = '<p class="text-muted">검색 결과가 없습니다.</p>';
      return;
    }
    if (data.projects?.length) {
      const projectHeader = document.createElement("h6");
      projectHeader.textContent = "프로젝트";
      searchResults.appendChild(projectHeader);
      const projectList = document.createElement("ul");
      projectList.className = "list-group mb-3";
      data.projects.forEach((project) => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action";
        li.dataset.projectId = project.id;
        li.innerHTML = `<strong>${project.name}</strong><p class="mb-0 text-muted">${project.description || "설명 없음"}</p>`;
        li.addEventListener("click", () => {
          const searchModalInstance = bootstrap.Modal.getInstance(searchModal);
          searchModalInstance?.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${project.id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: "smooth", block: "center" });
            requestAnimationFrame(() => applyHighlight(projectElement));
          }
        });
        projectList.appendChild(li);
      });
      searchResults.appendChild(projectList);
    }
    if (data.cards?.length) {
      const cardHeader = document.createElement("h6");
      cardHeader.textContent = "카드";
      searchResults.appendChild(cardHeader);
      const cardList = document.createElement("ul");
      cardList.className = "list-group";
      data.cards.forEach((card) => {
        const li = document.createElement("li");
        li.className = "list-group-item list-group-item-action";
        li.dataset.cardId = card.id;
        li.dataset.projectId = card.project_id;
        li.innerHTML = `<strong>${card.title}</strong> (프로젝트: ${card.project_name})<p class="mb-0 text-muted">${card.description || "설명 없음"}</p>`;
        li.addEventListener("click", () => {
          const searchModalInstance = bootstrap.Modal.getInstance(searchModal);
          searchModalInstance?.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: "smooth", block: "center" });
            requestAnimationFrame(() => applyHighlight(projectElement));
          }
        });
        cardList.appendChild(li);
      });
      searchResults.appendChild(cardList);
    }
  }

  function applyHighlight(element) {
    if (!element) return;
    document.querySelectorAll(".highlight").forEach((el) => el.classList.remove("highlight"));
    element.classList.add("highlight");
    setTimeout(() => element.classList.remove("highlight"), 2000);
  }

  searchInput?.addEventListener("input", debounce((e) => performSearch(e.target.value), 300));
  searchForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    performSearch(searchInput.value);
  });
  dueDateInput?.addEventListener("input", (e) => console.log(`마감일 입력: ${e.target.value} (미구현)`));

  // 소켓 이벤트 리스너
  socket.on("project_created", (data) => {
    loadProjectsList();
    appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 프로젝트 "${data.name}"을 생성했습니다.`);
  });

  socket.on("project_deleted", (data) => {
    const projectCard = document.querySelector(`.project-card-wrapper[data-project-id="${data.project_id}"]`);
    if (projectCard) projectCard.remove();
    appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 프로젝트를 삭제했습니다.`);
  });

  socket.on("project_invite", async (data) => {
    if (data.invitee_nickname === currentUser.nickname) {
      await loadInvitationsList(); // 초대 즉시 사이드바 업데이트
      alert(`[${data.timestamp}] ${data.inviter_nickname}님이 당신을 프로젝트에 초대했습니다.`);
      if (confirm("초대를 수락하시겠습니까?")) {
        socket.emit("respond_invite", { project_id: data.project_id, accepted: true });
      } else {
        socket.emit("respond_invite", { project_id: data.project_id, accepted: false });
      }
    }
  });

  socket.on("invite_response", async (data) => {
    if (data.accepted) {
      await loadProjectsList();
      await updateMemberCount(data.project_id); // 멤버 수 실시간 업데이트
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 초대를 수락했습니다.`);
    } else {
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 초대를 거절했습니다.`);
    }
  });

  socket.on("card_created", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCardsList();
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 카드 "${data.card_title}"을 생성했습니다.`);
    }
  });

  socket.on("card_deleted", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCardsList();
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 카드를 삭제했습니다.`);
    }
  });

  socket.on("card_updated", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCardsList();
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 카드를 업데이트했습니다.`);
    }
  });

  socket.on("card_moved", async (data) => {
    await loadCardsList(); // 카드 이동 즉시 반영
    appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 카드를 이동했습니다.`);
    if (data.source_project_id !== data.project_id) {
      appendSystemMessages(data.source_project_id, `[${data.timestamp}] ${data.nickname}님이 카드를 다른 프로젝트로 이동했습니다.`);
    }
  });

  socket.on("due_date_set", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCardsList();
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 카드 마감일을 설정했습니다: ${data.due_date}`);
    }
  });

  socket.on("due_date_updated", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCardsList();
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 카드 마감일을 업데이트했습니다: ${data.new_due_date}`);
    }
  });

  socket.on("comment_created", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCommentsList(data.project_id);
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 댓글을 추가했습니다.`);
    }
  });

  socket.on("comment_deleted", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCommentsList(data.project_id);
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 댓글을 삭제했습니다.`);
    }
  });

  socket.on("comment_updated", (data) => {
    if (data.project_id === window.currentProjectId) {
      loadCommentsList(data.project_id);
      appendSystemMessages(data.project_id, `[${data.timestamp}] ${data.nickname}님이 댓글을 수정했습니다.`);
    }
  });

  // 프로젝트 및 모달 이벤트
  const projectBoardModal = document.getElementById("projectBoardModal");
  projectBoardModal?.addEventListener("show.bs.modal", async function () {
    const projectId = this.dataset.projectId;
    if (!projectId) {
      console.error("프로젝트 ID 누락");
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }
    console.log(`모달 열림, 프로젝트 ID: ${projectId}`);
    window.currentProjectId = projectId;
    const deleteBtn = document.getElementById("modalDeleteBtn");
    const leaveBtn = document.getElementById("modalLeaveBtn");
    deleteBtn.classList.add("d-none");
    leaveBtn.classList.add("d-none");
    deleteBtn.dataset.projectId = projectId;
    leaveBtn.dataset.projectId = projectId;

    try {
      const response = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (response.ok) {
        const project = await response.json();
        document.getElementById("projectBoardTitle").textContent = project.name || "Project Board";
        document.getElementById("modalDeadline").textContent = project.deadline || "";
        document.getElementById("modalDday").textContent = project.d_day || "";
        const isOwner = project.owner_id === currentUser.id;
        if (isOwner) deleteBtn.classList.remove("d-none");
        else leaveBtn.classList.remove("d-none");
        updateMemberCount(projectId);
      } else {
        console.error("프로젝트 정보 로드 실패:", response.status);
        alert("프로젝트 정보를 불러오는 데 실패했습니다.");
      }
    } catch (err) {
      console.error("프로젝트 정보 로드 오류:", err);
      alert("프로젝트 정보를 불러오는 데 오류가 발생했습니다.");
    }
    loadCardsList();
    loadCommentsList(projectId);
    await loadHistory(projectId);
  });

  projectBoardModal?.addEventListener("shown.bs.modal", () => {
    console.log("모달 표시, 채팅창 가시성 보장");
    chatInstances.forEach((instance, projectId) => {
      const chatBox = instance.element;
      chatBox.style.zIndex = "10000";
      chatBox.classList.add("active");
      const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
      if (chatInput && document.activeElement.id !== `chatInput-${projectId}`) {
        setTimeout(() => {
          chatInput.focus();
          console.log(`강제로 포커스: ${projectId}`);
        }, 200);
      }
    });
  });

  projectBoardModal?.addEventListener("hidden.bs.modal", () => {
    console.log("모달 숨김, 채팅 상태 복구");
    chatInstances.forEach((instance, projectId) => {
      const chatBox = instance.element;
      if (!instance.isMinimized) {
        chatBox.classList.add("active");
        const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
        if (chatInput) {
          setTimeout(() => {
            chatInput.focus();
            console.log(`강제로 포커스: ${projectId}`);
          }, 100);
        }
      }
    });
  });

  projectBoardModal?.addEventListener("click", (e) => {
    e.stopPropagation();
    const commentInput = projectBoardModal.querySelector(".comment-input");
    if (commentInput && e.target.closest(".comment-section")) {
      setTimeout(() => {
        commentInput.focus();
        console.log("모달에서 댓글 입력 포커스");
      }, 100);
    }
  });

  projectBoardModal?.addEventListener("keydown", (e) => {
    if (document.activeElement.classList.contains("comment-input")) {
      console.log("댓글 입력 키다운, 키:", e.key);
      e.stopPropagation();
    } else if (document.activeElement.id.startsWith("chatInput-")) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log("채팅 입력 키다운 차단, 키:", e.key);
    }
  });

  // 프로젝트 삭제/나가기
  projectBoardModal?.addEventListener("click", async (e) => {
    const button = e.target.closest("#modalDeleteBtn, #modalLeaveBtn, .delete-project, .leave-project");
    if (!button) return;
    e.stopPropagation();
    const projectId = button.dataset.projectId;
    if (!projectId) {
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }
    const isOwner = button.id === "modalDeleteBtn" || button.classList.contains("delete-project");
    const action = isOwner ? "삭제" : "나가기";
    if (confirm(`이 프로젝트를 ${action}하시겠습니까?`)) {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
        if (response.ok) {
          socket.emit("project_deleted", {
            project_id: projectId,
            nickname: currentUser.nickname,
            timestamp: new Date().toLocaleTimeString("ko-KR"),
          });
          alert(`프로젝트가 ${action}되었습니다.`);
          window.location.reload();
        } else {
          const error = await response.json();
          alert(error.message || `프로젝트 ${action} 실패`);
        }
      } catch (err) {
        console.error(`프로젝트 ${action} 오류:`, err);
        alert("오류가 발생했습니다.");
      }
    }
  });

  // 채팅 버튼
  document.querySelectorAll(".open-chat-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const projectId = btn.dataset.projectId;
      const projectName = btn.dataset.projectName;
      window.currentProjectId = projectId;
      openChatWindow(projectId, projectName);
    });
  });

  // 프로젝트 카드 클릭
  document.querySelectorAll(".project-card-wrapper").forEach((wrapper) => {
    wrapper.addEventListener("click", (e) => {
      if (e.target.closest(".invite-member, .delete-project-btn, .leave-project, .add-card-btn, .open-chat-btn")) return;
      const projectId = wrapper.dataset.projectId;
      window.currentProjectId = projectId;
      const modal = document.getElementById("projectBoardModal");
      modal.dataset.projectId = projectId;
      const projectName = wrapper.querySelector(".card-title")?.textContent || "Project Board";
      document.getElementById("projectBoardTitle").textContent = projectName;
      const deadlineText = wrapper.dataset.deadline || "";
      const ddayBadge = wrapper.dataset.dDay || "";
      document.getElementById("modalDeadline").textContent = deadlineText;
      document.getElementById("modalDday").textContent = ddayBadge;
      const bootstrapModal = new bootstrap.Modal(modal, { backdrop: "static", keyboard: true });
      bootstrapModal.show();
      loadHistory(projectId);
    });
  });

  // 프로젝트 생성
  const createProjectBtn = document.getElementById("create-project-btn");
  createProjectBtn?.addEventListener("click", async () => {
    const formEl = document.getElementById("newProjectForm");
    const formData = new FormData(formEl);
    const newProjectData = {
      name: formData.get("name"),
      description: formData.get("description"),
      deadline: formData.get("due_date"),
    };
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProjectData),
        credentials: "include",
      });
      if (response.ok) {
        const result = await response.json();
        socket.emit("project_created", {
          project_id: result.id,
          name: newProjectData.name,
          nickname: currentUser.nickname,
          timestamp: new Date().toLocaleTimeString("ko-KR"),
        });
        alert("프로젝트가 생성되었습니다!");
        bootstrap.Modal.getInstance(document.getElementById("newProjectModal"))?.hide();
        formEl.reset();
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || "프로젝트 생성에 실패하였습니다");
      }
    } catch (err) {
      console.error("프로젝트 생성 오류:", err);
      alert("오류가 발생했습니다.");
    }
  });

  // 초대 보내기
  document.getElementById("inviteMemberForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const projectId = document.getElementById("inviteProjectId").value;
    const inviteData = { nickname: formData.get("nickname") };
    try {
      const response = await fetch(`/api/projects/${projectId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteData),
        credentials: "include",
      });
      if (response.ok) {
        socket.emit("project_invite", {
          project_id: projectId,
          invitee_nickname: inviteData.nickname,
          inviter_nickname: currentUser.nickname,
          timestamp: new Date().toLocaleTimeString("ko-KR"),
        });
        alert("초대가 성공적으로 전송되었습니다.");
        bootstrap.Modal.getInstance(document.getElementById("inviteMemberModal"))?.hide();
        e.target.reset();
      } else {
        const error = await response.json();
        alert(error.message || "초대 전송에 실패하였습니다");
      }
    } catch (error) {
      console.error("초대 전송 오류:", error);
      alert("오류가 발생했습니다.");
    }
  });

  document.querySelectorAll(".invite-member-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const projectId = button.dataset.projectId;
      document.getElementById("inviteProjectId").value = projectId;
      new bootstrap.Modal(document.getElementById("inviteMemberModal")).show();
    });
  });

  // 초대 목록 로드
  async function loadInvitationsList() {
    try {
      const response = await fetch("/api/invitations", {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error(`Failed to load invitations: ${response.status}`);
      const invitationData = await response.json();
      const invitationList = document.getElementById("invitationList");
      invitationList.innerHTML = "";
      invitationData.invitations.forEach((invitation) => {
        const listItem = document.createElement("li");
        listItem.className = "list-group-item d-flex justify-content-between align-items-center";
        listItem.innerHTML = `
          <span>${invitation.project_name} (${invitation.inviter_nickname || "Unknown"})</span>
          <div>
            <button class="btn btn-sm btn-success accept-invite-btn" data-project-id="${invitation.project_id}">수락</button>
            <button class="btn btn-sm btn-danger reject-invite-btn" data-project-id="${invitation.project_id}">거절</button>
          </div>`;
        invitationList.appendChild(listItem);
      });

      document.querySelectorAll(".accept-invite-btn, .reject-invite-btn").forEach((button) => {
        button.addEventListener("click", async () => {
          const projectId = button.dataset.projectId;
          const actionType = button.classList.contains("accept-invite-btn") ? "accept" : "reject";
          try {
            const response = await fetch(`/api/invitations/${actionType}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project_id: projectId }),
              credentials: "include",
            });
            if (response.ok) {
              socket.emit("invite_response", {
                project_id: projectId,
                accepted: actionType === "accept",
                nickname: currentUser.nickname,
                timestamp: new Date().toLocaleTimeString("ko-KR"),
              });
              alert(`초대가 ${actionType === "accept" ? "수락" : "거절"}되었습니다.`);
              await loadInvitationsList();
            } else {
              const error = await response.json();
              alert(error.message || `초대 ${actionType} 실패`);
            }
          } catch (error) {
            console.error(`초대 ${actionType} 오류:`, error);
            alert("오류가 발생했습니다.");
          }
        });
      });
    } catch (error) {
      console.error("초대 목록 로드 오류:", error);
      alert("초대 목록을 불러오는 데 실패했습니다.");
    }
  }

  // 멤버 수 업데이트
  async function updateMemberCount(projectId) {
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        const memberCountElement = document.querySelector(`.project-card-wrapper[data-project-id="${projectId}"] .member-count`);
        if (memberCountElement) {
          memberCountElement.textContent = `멤버: ${data.member_count}`;
        }
        const modalMemberCountElement = document.getElementById(`modalMemberCount-${projectId}`);
        if (modalMemberCountElement) {
          modalMemberCountElement.textContent = `멤버: ${data.member_count}`;
        }
      } else {
        console.error("멤버 수 로드 실패:", response.status);
      }
    } catch (error) {
      console.error("멤버 수 업데이트 오류:", error);
    }
  }

  // 카드 생성
  const createCardFormElement = document.getElementById("createCardForm");
  const createCardButton = document.getElementById("createCardButton");
  createCardFormElement?.addEventListener("submit", async (e) => {
    e.preventDefault();
    createCardButton.disabled = true;
    const cardFormData = new FormData(createCardFormElement);
    const cardData = {
      title: cardFormData.get("title"),
      description: cardFormData.get("description"),
      status: cardFormData.get("status") || "todo",
    };
    try {
      const response = await fetch(`/api/projects/${window.currentProjectId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardData),
        credentials: "include",
      });
      if (response.ok) {
        const result = await response.json();
        socket.emit("card_created", {
          project_id: window.currentProjectId,
          card_id: result.id,
          card_title: cardData.title,
          nickname: currentUser.nickname,
          timestamp: new Date().toLocaleTimeString("ko-KR"),
        });
        alert("카드가 생성되었습니다!");
        bootstrap.Modal.getInstance(document.getElementById("createCardModal"))?.hide();
        createCardFormElement.reset();
        await loadCardsList();
      } else {
        const error = await response.json();
        console.error("카드 생성 실패:", error);
        alert(error.message || "카드 생성에 실패하였습니다");
      }
    } catch (error) {
      console.error("카드 생성 오류:", error);
      alert("오류가 발생했습니다.");
    } finally {
      createCardButton.disabled = false;
    }
  });

  createCardButton?.addEventListener("click", (e) => {
    e.preventDefault();
    createCardFormElement.dispatchEvent(new Event("submit"));
  });

  document.querySelectorAll(".add-card-btn").forEach((button) => {
    button.addEventListener("click", () => {
      window.currentProjectId = button.dataset.projectId;
      new bootstrap.Modal(document.getElementById("createCardModal")).show();
    });
  });

  // 카드 로드
  async function loadCardsList() {
    try {
      const mainResponse = await fetch("/api/projects/all/cards", { credentials: "include" });
      if (!mainResponse.ok) {
        const error = await mainResponse.json();
        throw new Error(error.message || "카드 로드 실패");
      }
      const mainData = await mainResponse.json();
      const allCards = mainData.cards;
      document.querySelectorAll(".project-card-wrapper .card-container").forEach((container) => {
        container.innerHTML = "";
      });
      allCards.forEach((card) => {
        const container = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"] .card-container`);
        if (container) {
          const cardElement = createCardElement(card, false);
          container.appendChild(cardElement);
        }
      });

      if (window.currentProjectId) {
        const modalResponse = await fetch(`/api/projects/${window.currentProjectId}/cards`, { credentials: "include" });
        if (!modalResponse.ok) {
          const error = await modalResponse.json();
          throw new Error(error.message || "카드 로드 실패");
        }
        const modalData = await modalResponse.json();
        const projectCards = modalData.cards;
        const modalContainer = document.querySelector("#projectBoardModal .card-container");
        if (modalContainer) {
          modalContainer.innerHTML = "";
          projectCards.forEach((card) => {
            const cardElement = createCardElement(card, true);
            modalContainer.appendChild(cardElement);
          });
        }
        await loadHistory(window.currentProjectId);
        await loadCommentsList(window.currentProjectId);
      }
      initializeButtons();
    } catch (error) {
      console.error("카드 로드 오류:", error);
      alert("카드를 불러오는 데 실패했습니다.");
    }
  }

  function createCardElement(card, isModal = false) {
    const cardElement = document.createElement("div");
    cardElement.className = "task-card";
    cardElement.dataset.cardId = card.id;
    cardElement.dataset.projectId = card.project_id;
    cardElement.dataset.status = card.status;
    if (!isModal) cardElement.draggable = true;

    const statusClasses = {
      todo: "bg-primary",
      in_progress: "bg-warning",
      done: "bg-success",
    };
    const statusText = { todo: "To Do", in_progress: "In Progress", done: "Done" }[card.status] || card.status;
    const statusClass = statusClasses[card.status] || "bg-secondary";

    cardElement.innerHTML = `
      <div class="card-header">
        <h6 class="card-title">${card.title}</h6>
        ${isModal ? `
        <div class="card-buttons">
          <button type="button" class="btn btn-sm btn-outline-primary edit-card-btn" data-card-id="${card.id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger delete-card-btn" data-card-id="${card.id}">
            <i class="bi bi-trash"></i>
          </button>
        </div>` : ""}
      </div>
      ${isModal ? `<p class="card-description">${card.description || ""}</p>` : ""}
      <span class="badge ${statusClass} mt-2">${statusText}</span>`;

    if (!isModal) {
      cardElement.addEventListener("dragstart", handleCardDragStart);
      cardElement.addEventListener("dragend", handleCardDragEnd);
    }
    return cardElement;
  }

  function initializeButtons() {
    document.querySelectorAll(".edit-card-btn").forEach((button) => {
      button.replaceWith(button.cloneNode(true));
    });
    document.querySelectorAll(".delete-card-btn").forEach((button) => {
      button.replaceWith(button.cloneNode(true));
    });

    document.querySelectorAll(".edit-card-btn").forEach((button) => {
      button.addEventListener("click", async (e) => {
        e.stopPropagation();
        const cardId = button.dataset.cardId;
        const projectId = button.closest(".project-card-wrapper")?.dataset.projectId || window.currentProjectId;
        if (!projectId || !cardId) {
          alert("프로젝트 또는 카드 ID를 찾을 수 없습니다.");
          return;
        }
        try {
          const response = await fetch(`/api/projects/${projectId}/cards/${cardId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          if (response.ok) {
            const card = await response.json();
            const form = document.getElementById("editCardForm");
            form.querySelector("[name='title']").value = card.title || "";
            form.querySelector("[name='description']").value = card.description || "";
            form.querySelector("[name='status']").value = card.status || "todo";
            document.getElementById("editCardId").value = card.id;
            form.dataset.projectId = projectId;

            const updateCardButton = document.getElementById("updateCardBtn");
            const newUpdateButton = updateCardButton.cloneNode(true);
            updateCardButton.parentNode.replaceChild(newUpdateButton, updateCardButton);

            newUpdateButton.addEventListener("click", async () => {
              const cardFormData = new FormData(form);
              const cardData = {
                title: cardFormData.get("title"),
                description: cardFormData.get("description"),
                status: cardFormData.get("status"),
              };
              try {
                const response = await fetch(`/api/projects/${projectId}/cards/${cardId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(cardData),
                  credentials: "include",
                });
                if (response.ok) {
                  socket.emit("card_updated", {
                    project_id: projectId,
                    card_id: cardId,
                    nickname: currentUser.nickname,
                    timestamp: new Date().toLocaleTimeString("ko-KR"),
                  });
                  alert("카드가 수정되었습니다.");
                  bootstrap.Modal.getInstance(document.getElementById("editCardModal"))?.hide();
                  form.reset();
                  await loadCardsList();
                  await loadHistory(projectId);
                } else {
                  const error = await response.json();
                  alert(error.message || "카드 수정 실패");
                }
              } catch (error) {
                console.error("카드 수정 오류:", error);
                alert("카드 수정 중 오류가 발생했습니다.");
              }
            });
            new bootstrap.Modal(document.getElementById("editCardModal")).show();
          } else {
            const error = await response.json();
            alert(error.message || "카드 로드 실패");
          }
        } catch (error) {
          console.error("카드 로드 오류:", error);
          alert("카드 정보를 불러오는 데 실패했습니다.");
        }
      });
    });

    document.querySelectorAll(".delete-card-btn").forEach((button) => {
      button.addEventListener("click", async (e) => {
        e.stopPropagation();
        const cardId = button.dataset.cardId;
        if (confirm("이 카드를 삭제하시겠습니까?")) {
          try {
            const response = await fetch(`/api/projects/${window.currentProjectId}/cards/${cardId}`, {
              method: "DELETE",
              credentials: "include",
            });
            if (response.ok) {
              socket.emit("card_deleted", {
                project_id: window.currentProjectId,
                card_id: cardId,
                nickname: currentUser.nickname,
                timestamp: new Date().toLocaleTimeString("ko-KR"),
              });
              alert("카드가 삭제되었습니다.");
              await loadCardsList();
            } else {
              const error = await response.json();
              alert(error.message || "카드 삭제 실패");
            }
          } catch (error) {
            console.error("카드 삭제 오류:", error);
            alert("오류가 발생했습니다.");
          }
        }
      });
    });
  }

  // 채팅창 드래그
  function makeDraggable(element, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDragOver;
    }

    function elementDragOver(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = `${element.offsetTop - pos2}px`;
      element.style.left = `${element.offsetLeft - pos1}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // 채팅창 열기
  function openChatWindow(projectId, projectName) {
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
          console.log(`포커스 설정: ${projectId}`);
        }, 100);
      }
      return chatBox;
    }

    const chatBox = document.createElement("div");
    chatBox.className = "floating-chat active";
    chatBox.id = `chat-${projectId}`;
    chatBox.innerHTML = `
      <div class="chat-header" id="chatHeader-${projectId}">
        ${projectName || projectId} Chat
        <div class="chat-controls">
          <span id="minimizeChat-${projectId}">🗕</span>
          <span id="closeChat-${projectId}">✖</span>
        </div>
      </div>
      <div class="chat-body" id="chatBody-${projectId}">
        <div class="chat-messages" id="chatMessages-${projectId}"></div>
        <div class="chat-input-area">
          <input type="text" class="form-control chat-input" id="chatInput-${projectId}" placeholder="메시지를 입력하세요..." />
          <button type="submit" class="btn btn-primary chat-send-btn" id="sendChatBtn-${projectId}">전송</button>
        </div>
      </div>`;
    document.body.appendChild(chatBox);
    const offset = chatInstances.size * 20;
    chatBox.style.right = `${20 + offset}px`;
    chatBox.style.bottom = "20px";
    chatBox.style.zIndex = "10000";
    chatInstances.set(projectId, { element: chatBox, isMinimized: false });
    makeDraggable(chatBox, chatBox.querySelector(`#chatHeader-${projectId}`));

    chatBox.querySelector(`#minimizeChat-${projectId}`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      const instance = chatInstances.get(projectId);
      instance.isMinimized = !instance.isMinimized;
      const chatBody = chatBox.querySelector(`.chat-body`);
      chatBody.style.display = instance.isMinimized ? "none" : "flex";
      chatBox.classList.toggle("minimized", instance.isMinimized);
      chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = instance.isMinimized ? "🗖" : "🗕";
      if (instance.isMinimized) {
        chatBox.querySelector(`#chatHeader-${projectId}`).classList.remove("new-message");
      }
    });

    chatBox.querySelector(`#closeChat-${projectId}`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      socket.emit("leaveChat", { project_id: projectId });
      chatBox.remove();
      chatInstances.delete(projectId);
    });

    const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
    const sendButton = chatBox.querySelector(`#sendChatBtn-${projectId}`);
    sendButton.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const messageText = chatInput.value.trim();
      if (!messageText) return;
      socket.emit("send_message", { project_id: projectId, message: messageText }, (response) => {
        console.log(`메시지 전송: ${projectId}`, response);
      });
      chatInput.value = "";
      chatInput.focus();
    });

    chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.code === "Enter") {
        e.preventDefault();
        const messageText = chatInput.value.trim();
        if (!messageText) return;
        socket.emit("send_message", { project_id: projectId, message: messageText }, (response) => {
          console.log(`메시지 전송: ${projectId}`, response);
        });
        chatInput.value = "";
        chatInput.focus();
      }
    });

    chatInput.addEventListener("click", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      chatInput.disabled = false;
      chatInput.readOnly = false;
      setTimeout(() => {
        chatInput.focus();
      }, 10);
    });

    socket.emit("joinChat", { project_id: projectId }, (response) => {
      console.log(`참여 응답: ${projectId}`, response);
    });
  }

  // 채팅 메시지 추가
  function appendChatMessage(projectId, nickname, messageContent, timestamp) {
    const chatMessages = document.getElementById(`chatMessages-${projectId}`);
    if (!chatMessages) return;
    const messageDiv = document.createElement("div");
    const color = nickname === currentUser.nickname ? "green" : "black";
    messageDiv.innerHTML = `<strong style="color:${color}">${nickname}</strong>: ${messageContent} <small class="text-muted">${timestamp}</small>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    const instance = chatInstances.get(projectId);
    if (instance && instance.isMinimized) {
      document.getElementById(`chatHeader-${projectId}`).classList.add("new-message");
    }
  }

  function appendSystemMessages(projectId, message) {
    const chatMessages = document.getElementById(`chatMessages-${projectId}`);
    if (!chatMessages) return;
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("text-muted");
    messageDiv.textContent = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  socket.on("chat_message_history", (history) => {
    history.forEach((data) => {
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

  socket.on("notification", (data) => {
    if (data.project_id) {
      appendSystemMessages(data.project_id, data.message);
    }
  });

  socket.on("socketError", (error) => {
    console.error("Socket.IO 오류:", error);
    alert(`메시지 전송 오류: ${error.message}`);
  });

  // 히스토리 로드
  async function loadHistory(projectId) {
    try {
      const historyLoading = document.getElementById("history-loading");
      const historyList = document.getElementById("history-list");
      const historyArrow = document.getElementById("history-arrow");
      historyLoading.style.display = "block";
      historyList.innerHTML = "";
      historyList.classList.remove("open");
      const response = await fetch(`/api/projects/${projectId}/history`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      historyLoading.style.display = "none";

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const historyData = await response.json();
      if (!historyData.history || !Array.isArray(historyData.history) || historyData.history.length === 0) {
        historyList.innerHTML = "<li>히스토리가 없습니다.</li>";
        return;
      }

      historyData.history.forEach((entry) => {
        let detailMessage = "";
        const isStatusUpdate = entry.status === "card_status_update";
        const isCardUpdate = entry.status === "card_update";
        const isCardMove = entry.status === "card_move_in" || entry.status === "card_move_out";
        let shouldDisplay = true;

        if (isCardMove) {
          shouldDisplay = !(entry.details.from_project_id === entry.details.to_project_id);
        }
        if (isCardUpdate) {
          shouldDisplay = !!entry.details.description;
        }

        if (shouldDisplay) {
          switch (entry.status) {
            case "update_deadline_date":
              detailMessage = entry.details.old_deadline_date
                ? `마감일 변경: ${entry.details.old_deadline} → ${entry.details.new_deadline}`
                : `새 마감일 설정: ${entry.details.new_deadline}`;
              break;
            case "create_project":
              detailMessage = entry.details.project_name
                ? `프로젝트 생성: ${entry.details.project_name}`
                : `알 수 없는 프로젝트 생성`;
              break;
            default:
              detailMessage = `알 수 없는 액션: ${JSON.stringify(entry.details)}`;
          }
          const userLabel = entry.nickname || entry.user || "Unknown";
          const listItem = document.createElement("li");
          listItem.textContent = `${entry.created_at} ${userLabel}: ${detailMessage}`;
          historyList.appendChild(listItem);
        }
      });

      if (historyList.children.length > 0) {
        historyList.classList.add("open");
        historyArrow.classList.remove("bi-caret-right-fill");
        historyArrow.classList.add("bi-caret-down-fill");
      }
    } catch (error) {
      console.error("히스토리 로드 오류:", error);
      document.getElementById("history-loading").style.display = "none";
      document.getElementById("history-list").innerHTML = "<li>히스토리 로드 실패</li>";
    }
  }

  // 댓글 로드
  async function loadCommentsList(projectId) {
    if (!projectId) {
      console.error("댓글 로드에 필요한 프로젝트 ID 누락");
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/comments`, { credentials: "include" });
      if (!response.ok) throw new Error(`댓글 로드 실패: ${response.status}`);
      const commentData = await response.json();
      const commentList = document.getElementById("comment-list");
      commentList.innerHTML = "";
      commentData.comments.forEach((comment) => {
        const utcTime = comment.created_at.includes("Z") ? comment.created_at : comment.created_at.replace(" ", "T") + "Z";
        const dateTime = new Date(utcTime);
        const formattedTime = dateTime.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
        const isOwnComment = comment.author_id === currentUser.id;
        commentList.innerHTML += `
          <div class="comment mb-2" data-comment-id="${comment.id}">
            <b>${comment.author_name || "Unknown"}</b>
            <span style="color:gray; font-size:small;">${formattedTime}</span><br />
            <span class="comment-content">${comment.content || ""}</span>
            ${comment.image_url ? `<div class="mt-2"><img src="${comment.image_url}" class="img-fluid" style="max-height:200px;" alt="Comment image" /></div>` : ""}
            ${isOwnComment ? `
              <button type="button" class="btn btn-sm btn-outline-secondary edit-comment-btn">수정</button>
              <button type="button" class="btn btn-sm btn-outline-danger delete-comment-btn">삭제</button>
            ` : ""}
          </div>`;
      });
    } catch (error) {
      console.error("댓글 로드 오류:", error);
      alert("댓글을 불러오는 데 실패했습니다.");
    }
  }

  // 댓글 이벤트 위임
  document.getElementById("comment-list")?.addEventListener("click", async (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const commentDiv = button.closest(".comment");
    const commentId = commentDiv.dataset.commentId;
    const projectId = document.getElementById("projectBoardModal")?.dataset.projectId;

    if (button.classList.contains("edit-comment-btn")) {
      startEditComment(commentDiv);
    } else if (button.classList.contains("save-comment-btn")) {
      await saveCommentEdit(commentDiv, projectId);
    } else if (button.classList.contains("cancel-comment-btn")) {
      cancelCommentEdit(commentDiv);
    } else if (button.classList.contains("delete-comment-btn")) {
      if (confirm("이 댓글을 삭제하시겠습니까?")) {
        await deleteComment(commentId, projectId);
      }
    }
  });

  function startEditComment(commentDiv) {
    if (commentDiv.querySelector("textarea")) return;
    const commentSpan = commentDiv.querySelector(".comment-content");
    const originalImage = commentDiv.querySelector("img");
    commentSpan.style.display = "none";
    const textArea = document.createElement("textarea");
    textArea.className = "form-control mb-2";
    textArea.value = commentSpan.textContent;
    textArea.rows = 2;
    commentDiv.appendChild(textArea);
    let fileInput, removeCheckbox, removeLabel;
    if (originalImage) {
      originalImage.style.display = "none";
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.className = "form-control mb-2";
      commentDiv.appendChild(fileInput);
      removeCheckbox = document.createElement("input");
      removeCheckbox.type = "checkbox";
      removeCheckbox.id = `remove-img-${commentDiv.dataset.commentId}`;
      removeCheckbox.className = "form-check-input mb-1";
      removeLabel = document.createElement("label");
      removeLabel.htmlFor = removeCheckbox.id;
      removeLabel.textContent = "이미지 제거";
      removeLabel.className = "form-check-label mb-2";
      const removeContainer = document.createElement("div");
      removeContainer.className = "form-check mb-2";
      removeContainer.appendChild(removeCheckbox);
      removeContainer.appendChild(removeLabel);
      commentDiv.appendChild(removeContainer);
    }
    const saveButton = document.createElement("button");
    saveButton.className = "btn btn-sm btn-primary me-1 save-comment-btn";
    saveButton.textContent = "저장";
    const cancelButton = document.createElement("button");
    cancelButton.className = "btn btn-sm btn-secondary cancel-comment-btn";
    cancelButton.textContent = "취소";
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "mb-2";
    buttonGroup.appendChild(saveButton);
    buttonGroup.appendChild(cancelButton);
    commentDiv.appendChild(buttonGroup);
  }

  async function saveCommentEdit(commentDiv, projectId) {
    const textArea = commentDiv.querySelector("textarea");
    const newCommentText = textArea.value.trim();
    if (!newCommentText) return alert("댓글 내용을 입력하세요.");
    const originalImage = commentDiv.querySelector("img");
    const fileInput = commentDiv.querySelector("input[type=file]");
    const removeCheckbox = commentDiv.querySelector(".form-check-input");
    let response;
    if (fileInput?.files.length || (removeCheckbox && removeCheckbox.checked)) {
      const commentFormData = new FormData();
      commentFormData.append("content", newCommentText);
      if (fileInput?.files.length) commentFormData.append("image", fileInput.files[0]);
      if (removeCheckbox?.checked) commentFormData.append("delete_image", "true");
      response = await fetch(`/api/comments/${commentDiv.dataset.commentId}`, {
        method: "PUT",
        body: commentFormData,
        credentials: "include",
      });
    } else {
      response = await fetch(`/api/comments/${commentDiv.dataset.commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newCommentText }),
        credentials: "include",
      });
    }
    if (!response.ok) {
      const error = await response.json();
      return alert(error.message || "댓글 수정 실패");
    }
    commentDiv.querySelector(".comment-content").textContent = newCommentText;
    if (originalImage) {
      if (removeCheckbox?.checked) {
        originalImage.remove();
      } else if (fileInput?.files.length) {
        originalImage.src = URL.createObjectURL(fileInput.files[0]);
      }
      originalImage.style.display = "block";
    }
    socket.emit("comment_updated", {
      project_id: projectId,
      comment_id: commentDiv.dataset.commentId,
      nickname: currentUser.nickname,
      timestamp: new Date().toLocaleTimeString("ko-KR"),
    });
    cancelCommentEdit(commentDiv);
  }

  function cancelCommentEdit(commentDiv) {
    commentDiv.querySelectorAll("textarea, .form-check, .save-comment-btn, .cancel-comment-btn, input[type=file]").forEach((element) => element.remove());
    commentDiv.querySelector(".comment-content").style.display = "block";
    const commentImage = commentDiv.querySelector("img");
    if (commentImage) commentImage.style.display = "block";
  }

  async function deleteComment(commentId, projectId) {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        socket.emit("comment_deleted", {
          project_id: projectId,
          comment_id: commentId,
          nickname: currentUser.nickname,
          timestamp: new Date().toLocaleTimeString("ko-KR"),
        });
        loadCommentsList(projectId);
      } else {
        const error = await response.json();
        alert(error.message || "댓글 삭제 실패");
      }
    } catch (error) {
      console.error("댓글 삭제 오류:", error);
      alert("댓글 삭제 중 오류가 발생했습니다.");
    }
  }

  document.getElementById("add-comment-btn")?.addEventListener("click", async () => {
    const contentInput = document.getElementById("new-comment-content");
    const fileInput = document.getElementById("new-comment-image");
    const commentContent = contentInput.value.trim();
    const projectId = document.getElementById("projectBoardModal")?.dataset.projectId;
    if (!commentContent && !fileInput.files.length) {
      alert("댓글 내용 또는 이미지를 입력하세요.");
      return;
    }
    if (!projectId) {
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }
    const commentFormData = new FormData();
    if (commentContent) commentFormData.append("content", commentContent);
    if (fileInput.files.length) commentFormData.append("image", fileInput.files[0]);
    try {
      const response = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        body: commentFormData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.message || "댓글 추가 실패");
        return;
      }
      const result = await response.json();
      socket.emit("comment_created", {
        project_id: projectId,
        comment_id: result.id,
        content: commentContent,
        nickname: currentUser.nickname,
        timestamp: new Date().toLocaleTimeString("ko-KR"),
      });
      contentInput.value = "";
      fileInput.value = "";
      loadCommentsList(projectId);
    } catch (error) {
      console.error("댓글 추가 오류:", error);
      alert("댓글 추가 중 오류가 발생했습니다.");
    }
  });

  // 드래그 앤 드롭
  function initializeDragAndDropEvents() {
    const scrollContainer = document.querySelector(".project-scroll-container");
    const kanbanBoard = document.querySelector(".kanban-board");
    scrollContainer?.addEventListener("wheel", (e) => {
      if (!isDragging) {
        e.preventDefault();
        scrollContainer.scrollLeft += e.deltaY * 0.5;
      }
    });
    kanbanBoard?.addEventListener("wheel", (e) => {
      if (!isDragging) {
        e.preventDefault();
        kanbanBoard.scrollLeft += e.deltaY * 0.5;
      }
    });

    const projectCards = scrollContainer.querySelectorAll(".project-card-wrapper");
    projectCards.forEach((card) => {
      card.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startY = e.clientY;
        dragTimer = setTimeout(() => {
          startProjectDrag(card, e.clientX, e.clientY);
        }, 200);
      });

      card.addEventListener("mousemove", (e) => {
        if (isDragging && dragged) {
          e.preventDefault();
          handleProjectDrag(e.clientX, e.clientY);
        }
      });

      card.addEventListener("mouseup", () => {
        clearTimeout(dragTimer);
        if (isDragging) endProjectDrag();
      });

      card.addEventListener("mouseleave", () => {
        clearTimeout(dragTimer);
      });

      card.addEventListener("touchstart", (e) => {
        if (e.target.closest(".task-card")) return;
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        dragTimer = setTimeout(() => {
          startProjectDrag(card, touch.clientX, touch.clientY);
        }, 300);
      });

      card.addEventListener("touchmove", (e) => {
        if (isDragging && dragged) {
          e.preventDefault();
          const touch = e.touches[0];
          handleProjectDrag(touch.clientX, touch.clientY);
        }
      });

      card.addEventListener("touchend", () => {
        clearTimeout(dragTimer);
        if (isDragging) endProjectDrag();
      });
    });

    function startProjectDrag(card, x, y) {
      if (isDragging) return;
      isDragging = true;
      wasDragging = true;
      dragged = card;
      card.classList.add("dragging");
      dragClone = card.cloneNode(true);
      dragClone.classList.add("drag-clone");
      dragClone.style.width = `${card.offsetWidth}px`;
      dragClone.style.height = `${card.offsetHeight}px`;
      dragClone.style.left = `${x - card.offsetWidth / 2}px`;
      dragClone.style.top = `${y - card.offsetHeight / 2}px`;
      document.body.appendChild(dragClone);
    }

    function handleProjectDrag(x, y) {
      if (!dragClone || !dragged) return;
      dragClone.style.left = `${x - dragged.offsetWidth / 2}px`;
      dragClone.style.top = `${y - dragged.offsetHeight / 2}px`;
      const containerRect = scrollContainer.getBoundingClientRect();
      const scrollSpeed = 20;
      const edgeThreshold = 50;

      if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);

      function scrollStep() {
        if (!isDragging) return;
        if (x < containerRect.left + edgeThreshold) {
          scrollContainer.scrollLeft -= scrollSpeed;
        } else if (x > containerRect.right - edgeThreshold) {
          scrollContainer.scrollLeft += scrollSpeed;
        }
        const target = document.elementFromPoint(x, y);
        const targetCard = target?.closest(".project-card-wrapper");
        if (targetCard && targetCard !== dragged && !targetCard.classList.contains("drag-clone")) {
          const cardRect = targetCard.getBoundingClientRect();
          const insertBeforeTarget = x < cardRect.left + cardRect.width / 2;
          if (insertBeforeTarget) {
            scrollContainer.insertBefore(dragged, targetCard);
          } else {
            if (targetCard.nextSibling) {
              scrollContainer.insertBefore(dragged, targetCard.nextSibling);
            } else {
              scrollContainer.appendChild(dragged);
            }
          }
        }
        if (isDragging) scrollAnimationFrame = requestAnimationFrame(scrollStep);
      }
      scrollAnimationFrame = requestAnimationFrame(scrollStep);
    }

    function endProjectDrag() {
      if (!isDragging || !dragged) return;
      isDragging = false;
      dragged.classList.remove("dragging");
      if (dragClone) {
        dragClone.remove();
        dragClone = null;
      }
      saveProjectOrder();
      dragged = null;
      if (scrollAnimationFrame) {
        cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = null;
      }
      setTimeout(() => wasDragging = false, 100);
    }

    function saveProjectOrder() {
      const order = [...scrollContainer.querySelectorAll(".project-card-wrapper")].map((card) => 
        card.getAttribute("data-project-id"));
      localStorage.setItem("projectOrder", JSON.stringify(order));
    }

    const cardContainers = document.querySelectorAll(".card-container");
    cardContainers.forEach((container) => {
      container.addEventListener("dragover", handleCardDragOver);
      container.addEventListener("dragenter", handleCardDragEnter);
      container.addEventListener("dragleave", handleCardDragLeave);
      container.addEventListener("drop", handleCardDrop);
    });

    function handleCardDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }

    function handleCardDragEnter(e) {
      e.preventDefault();
      e.stopPropagation();
      const container = e.target.closest(".card-container");
      if (container) return;
      if (container && draggedCard) {
        container.classList.add("drag-over");
        const cards = [...container.querySelectorAll(".task-card:not(.dragging)")];
        const dropY = e.clientY;
        const closestCard = cards.reduce(
          (closest, card) => {
            const box = card.getBoundingClientRect();
            const offset = dropY - (box.top + box.height / 2);
            if (offset < 0 && offset > closest.offset) {
              return { offset, element: card };
            }
            return closest;
          },
          { offset: Number.NEGATIVE_INFINITY }
        ).element;

        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        placeholder = document.createElement("div");
        placeholder.className = "card-placeholder";
        placeholder.style.height = `${draggedCard.offsetHeight}px`;
        if (closestCard) {
          container.insertBefore(placeholder, closestCard);
        } else {
          container.appendChild(placeholder);
        }
      }
    }

    function handleCardDragLeave(e) {
      e.stopPropagation();
      const container = e.target.closest(".card-container");
      if (container) container.classList.remove("drag-over");
    }

    async function handleCardDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      const container = e.target.closest(".card-container");
      if (!container || !draggedCard) {
        if (draggedCard) draggedCard.style.display = "block";
        if (placeholder) placeholder.remove();
        return;
      }
      container.classList.remove("drag-over");
      const cardId = e.dataTransfer.getData("text/plain");
      const targetProjectId = container.closest(".project-card-wrapper")?.dataset.projectId;
      if (!targetProjectId) {
        alert("대상 프로젝트 ID를 찾을 수 없습니다.");
        return;
      }
      if (placeholder && placeholder.parentNode === container) {
        container.replaceChild(draggedCard, placeholder);
      } else {
        container.appendChild(draggedCard);
      }
      draggedCard.style.display = "block";
      if (placeholder) {
        placeholder.remove();
        placeholder = null;
      }
      await updateCardProjectAndOrder(cardId, targetProjectId, container);
    }

    async function updateCardProjectAndOrder(cardId, targetProjectId, container) {
      try {
        const cards = [...container.querySelectorAll(".task-card")];
        const order = cards.map((card) => card.dataset.cardId);
        const sourceProjectId = draggedCard.dataset.projectId;
        if (!sourceProjectId || !cardId || !targetProjectId) {
          throw new Error("프로젝트 또는 카드 ID 누락");
        }
        const payload = { cardId: cardId, projectId: targetProjectId, sourceProjectId: sourceProjectId, order: order };
        const response = await fetch(`/api/projects/${sourceProjectId}/cards/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        if (!response.ok) {
          const error = await response.json();
          alert(error.message || "카드 이동/순서 변경 실패");
          return;
        }
        if (draggedCard) draggedCard.dataset.projectId = targetProjectId;
        socket.emit("card_moved", {
          project_id: targetProjectId,
          source_project_id: sourceProjectId,
          card_id: cardId,
          nickname: currentUser.nickname,
          timestamp: new Date().toLocaleTimeString("ko-KR"),
        });
        await loadHistory(sourceProjectId);
        await loadHistory(targetProjectId);
        loadCardsList();
      }
      catch (error) {
        console.error("카드 이동 오류:", error);
        alert("카드 이동/순서 변경 중 오류가 발생했습니다: " + error.message);
      }
    }
  }

  function handleCardDragStart(e) {
    e.stopPropagation();
    draggedCard = e.target.closest(".task-card");
    draggedCard.classList.add("dragging");
    e.dataTransfer.setData("text/plain", draggedCard.dataset.cardId);
    placeholder = document.createElement("div");
    placeholder.className = "card-placeholder";
    placeholder.style.height = `${draggedCard.offsetHeight}px`;
    setTimeout(() => (draggedCard.style.display = "none"), 0);
  }

  function handleCardDragEnd(e) {
    e.stopPropagation();
    if (draggedCard) {
      draggedCard.classList.remove("dragging");
      draggedCard.style.display = "block";
    }
    if (placeholder) {
      placeholder.remove();
      placeholder = null;
    }
    document.querySelectorAll(".card-container").forEach((container) => {
      container.classList.remove("drag-over");
    });
    draggedCard = null;
  }

  // 프로젝트 목록 로드
  async function loadProjectsList() {
    try {
      const response = await fetch("/api/projects", { credentials: "include" });
      if (!response.ok) {
        console.error("프로젝트 로드 실패:", response.status);
        throw new Error("프로젝트 로드 실패");
      }
      const data = await response.json();
      const projectContainer = document.querySelector(".project-scroll-container");
      projectContainer.innerHTML = "";
      const projectOrder = JSON.parse(localStorage.getItem("projectOrder")) || [];
      const orderedProjects = [];
      projectOrder.forEach((id) => {
        const project = data.projects.find((p) => p.id === id);
        if (project) orderedProjects.push(project);
      });
      data.projects.forEach((project) => {
        if (!orderedProjects.includes(project)) orderedProjects.push(project);
      });
      orderedProjects.forEach((project) => {
        const projectCard = document.createElement("div");
        projectCard.className = "project-card-wrapper";
        projectCard.dataset.projectId = project.id;
        projectCard.innerHTML = `
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">${project.name}</h5>
              <p class="member-count">멤버: ${project.member_count || 0}</p>
              <div class="card-container"></div>
            </div>
          </div>`;
          projectContainer.appendChild(projectCard);
          projectCard.addEventListener("click", (e) => {
            if (e.target.closest(".invite-member, .delete-project-btn, .leave-project, .add-card-btn, .open-chat-btn")) return;
            window.currentProjectId = project.id;
            const modalPanel = document.querySelector("#modalPanel");
            modalPanel.dataset.id = project.id;
            const projectTitle = projectCard.querySelector(".card-title");
            modalPanel.querySelector("#modalTitle").textContent = projectTitle.textContent;
            const bootstrapModalPanelModal = new bootstrap.ModalPanelModal(modalPanel, { backdrop: 'static', panel: true });
            bootstrapModalPanelModal.showModal();
            loadHistory(project.id);
          });
        });
        loadCardsList();
      } catch (error) {
        console.error("프로젝트 목록 로드 오류:", error);
        alert("프로젝트를 불러오는 데 실패했습니다.");
      }
    }

    loadProjectsList();
    loadInvitationsList();
    isDashboardInitialized = true;
    console.log("대시보드 초기화 완료.");
  }

  document.addEventListener("DOMContentLoaded", () => initializeDashboard());