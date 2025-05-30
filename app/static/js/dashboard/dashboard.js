// dashboard.js
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
const currentUser = window.currentUser || { id: "", nickname: "" };

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
  initializeDragAndDrop();

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
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const dueDateInput = document.getElementById('dueDateInput');
  const searchResults = document.getElementById('searchResults');
  searchButton?.addEventListener('click', () => console.log('검색 버튼 클릭, 검색 모달 열기'));
  searchModal?.addEventListener('shown.bs.modal', () => {
    setTimeout(() => {
      searchInput.focus();
      console.log('검색 모달 표시, searchInput에 포커스');
    }, 50);
    searchInput.value = '';
    searchResults.innerHTML = '<p class="text-muted">키워드를 입력하세요.</p>';
  });

  async function performSearch(keyword) {
    try {
      if (!keyword.trim()) {
        searchResults.innerHTML = '<p class="text-muted">키워드를 입력하세요.</p>';
        return;
      }
      const response = await fetch(`/projects/search?keyword=${encodeURIComponent(keyword)}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log('검색 결과:', data);
      renderResults(data);
    } catch (error) {
      console.error('검색 오류:', error);
      searchResults.innerHTML = '<p class="text-danger">검색 중 오류가 발생했습니다.</p>';
    }
  }

  function renderResults(data) {
    searchResults.innerHTML = '';
    if (!data.projects.length && !data.cards.length) {
      searchResults.innerHTML = '<p class="text-muted">검색 결과가 없습니다.</p>';
      return;
    }
    if (data.projects.length) {
      const projectHeader = document.createElement('h6');
      projectHeader.textContent = '프로젝트';
      searchResults.appendChild(projectHeader);
      const projectList = document.createElement('ul');
      projectList.className = 'list-group mb-3';
      data.projects.forEach(project => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action';
        li.dataset.projectId = project.id;
        li.innerHTML = `<strong>${project.name}</strong><p class="mb-0 text-muted">${project.description || '설명 없음'}</p>`;
        li.addEventListener('click', () => {
          const searchModal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
          searchModal.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${project.id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            requestAnimationFrame(() => applyHighlight(projectElement));
          }
        });
        projectList.appendChild(li);
      });
      searchResults.appendChild(projectList);
    }
    if (data.cards.length) {
      const cardHeader = document.createElement('h6');
      cardHeader.textContent = '카드';
      searchResults.appendChild(cardHeader);
      const cardList = document.createElement('ul');
      cardList.className = 'list-group';
      data.cards.forEach(card => {
        const li = document.createElement('li');
        li.className = 'list-group-item list-group-item-action';
        li.dataset.cardId = card.id;
        li.dataset.projectId = card.project_id;
        li.innerHTML = `<strong>${card.title}</strong> (프로젝트: ${card.project_name})<p class="mb-0 text-muted">${card.description || '설명 없음'}</p>`;
        li.addEventListener('click', () => {
          const searchModal = bootstrap.Modal.getInstance(document.getElementById('searchModal'));
          searchModal.hide();
          const projectElement = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"]`);
          if (projectElement) {
            projectElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    element.classList.add('highlight');
    setTimeout(() => element.classList.remove('highlight'), 2000);
  }

  searchInput?.addEventListener('input', debounce((e) => performSearch(e.target.value), 300));
  searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch(searchInput.value);
  });
  dueDateInput?.addEventListener('input', (e) => console.log(`마감일 입력: ${e.target.value} (미구현)`));

  // 프로젝트 및 모달 관련 이벤트
  const projectBoardModal = document.getElementById('projectBoardModal');
  projectBoardModal?.addEventListener('show.bs.modal', async function () {
    const projectId = this.dataset.projectId;
    if (!projectId) {
      console.error("프로젝트 ID 누락");
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }
    console.log(`모달 열림, 프로젝트 ID: ${projectId}`);
    const deleteBtn = document.getElementById('modalDeleteBtn');
    const leaveBtn = document.getElementById('modalLeaveBtn');
    deleteBtn.classList.add('d-none');
    leaveBtn.classList.add('d-none');
    deleteBtn.dataset.projectId = projectId;
    leaveBtn.dataset.projectId = projectId;

    try {
      const response = await fetch(`/projects/${projectId}`, { credentials: "include" });
      if (response.ok) {
        const project = await response.json();
        const isOwner = project.owner_id === currentUser.id;
        if (isOwner) deleteBtn.classList.remove('d-none');
        else leaveBtn.classList.remove('d-none');
      } else {
        console.error("프로젝트 정보 로드 실패:", response.status);
        alert("프로젝트 정보를 불러오는 데 실패했습니다.");
      }
    } catch (err) {
      console.error("프로젝트 정보 로드 오류:", err);
      alert("프로젝트 정보를 불러오는 데 오류가 발생했습니다.");
    }
    loadComments(projectId);
    loadCards();
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
  projectBoardModal?.addEventListener("click", async e => {
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
        const response = await fetch(`/projects/${projectId}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include"
        });
        if (response.ok) {
          alert(`프로젝트가 ${action}되었습니다.`);
          window.location.reload();
        } else {
          const error = await response.json();
          alert(error.error || `프로젝트 ${action} 실패`);
        }
      } catch (err) {
        console.error(`프로젝트 ${action} 오류:`, err);
        alert("오류가 발생했습니다.");
      }
    }
  });

  // 채팅 버튼
  document.querySelectorAll(".open-chat-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const projectId = btn.dataset.projectId;
      const projectName = btn.dataset.projectName;
      window.currentProjectId = projectId;
      openChat(projectId, projectName);
    });
  });

  // 프로젝트 카드 클릭
  document.querySelectorAll(".project-card-wrapper").forEach(wrapper => {
    wrapper.addEventListener("click", (e) => {
      if (e.target.closest(".invite-member, .delete-project, .leave-project, .add-card-btn, .open-chat-btn")) return;
      const projectId = wrapper.dataset.projectId;
      window.currentProjectId = projectId;
      const modal = document.getElementById("projectBoardModal");
      modal.dataset.projectId = projectId;
      const projectName = wrapper.querySelector(".card-title")?.textContent || "프로젝트 보드";
      document.getElementById("projectBoardTitle").textContent = projectName;
      const deadlineText = wrapper.dataset.deadline || '';
      const ddayBadge = wrapper.dataset.dDay || '';
      document.getElementById("modalDeadline").textContent = deadlineText;
      document.getElementById("modalDday").textContent = ddayBadge;
      const bsModal = new bootstrap.Modal(modal, { backdrop: 'static', keyboard: true });
      bsModal.show();
      loadHistory(projectId);
    });
  });

  // 프로젝트 생성
  document.getElementById("createProject")?.addEventListener("click", async () => {
    const form = document.getElementById("newProjectForm");
    const formData = new FormData(form);
    const data = {
      name: formData.get("name"),
      description: formData.get("description"),
      deadline: formData.get("deadline")
    };
    try {
      const response = await fetch("/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        alert("프로젝트가 생성되었습니다!");
        bootstrap.Modal.getInstance(document.getElementById("newProjectModal")).hide();
        form.reset();
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || "프로젝트 생성 실패");
      }
    } catch (err) {
      console.error("프로젝트 생성 오류:", err);
      alert("오류가 발생했습니다.");
    }
  });

  // 초대 보내기
  document.getElementById("sendInvite")?.addEventListener("click", async () => {
    const form = document.getElementById("inviteMemberForm");
    const formData = new FormData(form);
    const projectId = document.getElementById("inviteProjectId").value;
    const data = { nickname: formData.get("nickname") };
    try {
      const response = await fetch(`/projects/${projectId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        alert("초대가 전송되었습니다.");
        bootstrap.Modal.getInstance(document.getElementById("inviteMemberModal")).hide();
        form.reset();
      } else {
        const error = await response.json();
        alert(error.message || "초대 전송 실패");
      }
    } catch (err) {
      console.error("초대 전송 오류:", err);
      alert("오류가 발생했습니다.");
    }
  });

  document.querySelectorAll(".invite-member").forEach(button => {
    button.addEventListener("click", e => {
      e.stopPropagation();
      const projectId = button.dataset.projectId;
      document.getElementById("inviteProjectId").value = projectId;
      new bootstrap.Modal(document.getElementById("inviteMemberModal")).show();
    });
  });

  // 초대 목록 로드
  async function loadInvitations() {
    try {
      const response = await fetch("/invitations");
      if (response.ok) {
        const data = await response.json();
        invitationList.innerHTML = "";
        data.invitations.forEach(invitation => {
          const li = document.createElement("li");
          li.className = "list-group-item d-flex justify-content-between align-items-center";
          li.innerHTML = `
            ${invitation.nickname || invitation.name || "알 수 없음"}
            <div>
              <button class="btn btn-sm btn-success accept-invite" data-project-id="${invitation.id}">수락</button>
              <button class="btn btn-sm btn-danger decline-invite" data-project-id="${invitation.id}">거절</button>
            </div>
          `;
          invitationList.appendChild(li);
        });

        document.querySelectorAll(".accept-invite, .decline-invite").forEach(button => {
          button.addEventListener("click", async () => {
            const projectId = button.dataset.projectId;
            const action = button.classList.contains("accept-invite") ? "accept" : "decline";
            try {
              const response = await fetch("/invitations/respond", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: projectId, action })
              });
              if (response.ok) {
                alert(`초대를 ${action === "accept" ? "수락" : "거절"}했습니다.`);
                loadInvitations();
              } else {
                const error = await response.json();
                alert(error.message || "초대 응답 실패");
              }
            } catch (err) {
              console.error("초대 응답 오류:", err);
              alert("오류가 발생했습니다.");
            }
          });
        });
      } else {
        const error = await response.json();
        alert(error.message || "초대 목록 로드 실패");
      }
    } catch (err) {
      console.error("초대 목록 로드 오류:", err);
      alert("초대 목록 로드 중 오류가 발생했습니다.");
    }
  }
  loadInvitations();

  // 카드 생성
  const createCardForm = document.getElementById("createCardForm");
  const createCardBtn = document.getElementById("createCard");
  createCardForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    createCardBtn.disabled = true;
    const formData = new FormData(createCardForm);
    const data = {
      title: formData.get("title"),
      description: formData.get("description"),
      status: formData.get("status") || "todo"
    };
    try {
      const response = await fetch(`/projects/${window.currentProjectId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        alert("카드가 생성되었습니다!");
        bootstrap.Modal.getInstance(document.getElementById("createCardModal")).hide();
        createCardForm.reset();
        await loadCards();
      } else {
        const error = await response.json();
        console.error("카드 생성 실패:", error);
        alert(error.message || "카드 생성 실패");
      }
    } catch (err) {
      console.error("카드 생성 오류:", err);
      alert("오류가 발생했습니다.");
    } finally {
      createCardBtn.disabled = false;
    }
  });

  createCardBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    createCardForm.dispatchEvent(new Event("submit"));
  });

  document.querySelectorAll(".add-card-btn").forEach(button => {
    button.addEventListener("click", () => {
      window.currentProjectId = button.dataset.projectId;
      new bootstrap.Modal(document.getElementById("createCardModal")).show();
    });
  });

  // 카드 로드
  async function loadCards() {
    try {
      const mainResponse = await fetch("/projects/all/cards");
      if (!mainResponse.ok) {
        const error = await mainResponse.json();
        throw new Error(error.message || "카드 로드 실패");
      }
      const mainData = await mainResponse.json();
      const allCards = mainData.cards;
      document.querySelectorAll(".project-card-wrapper .card-container").forEach(container => {
        container.innerHTML = "";
      });
      allCards.forEach(card => {
        const container = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"] .card-container`);
        if (container) {
          const cardElement = createCardElement(card, false);
          container.appendChild(cardElement);
        }
      });

      if (window.currentProjectId) {
        const modalResponse = await fetch(`/projects/${window.currentProjectId}/cards`);
        if (!modalResponse.ok) {
          const error = await modalResponse.json();
          throw new Error(error.message || "카드 로드 실패");
        }
        const modalData = await modalResponse.json();
        const projectCards = modalData.cards;
        const modalContainer = document.querySelector("#projectBoardModal .card-container");
        if (modalContainer) {
          modalContainer.innerHTML = "";
          projectCards.forEach(card => {
            const cardElement = createCardElement(card, true);
            modalContainer.appendChild(cardElement);
          });
        }
        await loadHistory(window.currentProjectId);
        await loadComments(window.currentProjectId);
      }
      initializeCardButtons();
    } catch (err) {
      console.error("카드 로드 오류:", err);
      alert("카드 로드 중 오류가 발생했습니다.");
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
      done: "bg-success"
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
        </div>
        ` : ''}
      </div>
      ${isModal ? `<p class="card-description">${card.description}</p>` : ''}
      <span class="badge ${statusClass} mt-2">${statusText}</span>
    `;

    if (!isModal) {
      cardElement.addEventListener("dragstart", handleCardDragStart);
      cardElement.addEventListener("dragend", handleCardDragEnd);
    }
    return cardElement;
  }

  function initializeCardButtons() {
    document.querySelectorAll(".edit-card-btn").forEach(button => {
      button.replaceWith(button.cloneNode(true));
    });
    document.querySelectorAll(".delete-card-btn").forEach(button => {
      button.replaceWith(button.cloneNode(true));
    });

    document.querySelectorAll(".edit-card-btn").forEach(button => {
      button.addEventListener("click", async e => {
        e.stopPropagation();
        const cardId = button.dataset.cardId;
        const projectId = button.closest('.project-card-wrapper')?.dataset.projectId || window.currentProjectId;
        if (!projectId || !cardId) {
          alert("프로젝트 또는 카드 ID를 찾을 수 없습니다.");
          return;
        }
        try {
          const response = await fetch(`/projects/${projectId}/cards/${cardId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            credentials: "include"
          });
          if (response.ok) {
            const card = await response.json();
            const form = document.getElementById("editCardForm");
            form.querySelector("[name='title']").value = card.title || "";
            form.querySelector("[name='description']").value = card.description || "";
            form.querySelector("[name='status']").value = card.status || "todo";
            document.getElementById("editCardId").value = card.id;
            form.dataset.projectId = projectId;

            const updateCardBtn = document.getElementById("updateCard");
            const newUpdateCardBtn = updateCardBtn.cloneNode(true);
            updateCardBtn.parentNode.replaceChild(newUpdateCardBtn, updateCardBtn);

            newUpdateCardBtn.addEventListener("click", async () => {
              const formData = new FormData(form);
              const data = {
                title: formData.get("title"),
                description: formData.get("description"),
                status: formData.get("status")
              };
              try {
                const response = await fetch(`/projects/${projectId}/cards/${cardId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data)
                });
                if (response.ok) {
                  alert("카드가 수정되었습니다.");
                  bootstrap.Modal.getInstance(document.getElementById("editCardModal")).hide();
                  form.reset();
                  await loadCards();
                  await loadHistory(projectId);
                } else {
                  const error = await response.json();
                  alert(error.message || "카드 수정 실패");
                }
              } catch (err) {
                console.error("카드 수정 오류:", err);
                alert("카드 수정 중 오류가 발생했습니다.");
              }
            });
            new bootstrap.Modal(document.getElementById("editCardModal")).show();
          } else {
            const error = await response.json();
            alert(error.message || "카드 정보 로드 실패");
          }
        } catch (err) {
          console.error("카드 정보 로드 오류:", err);
          alert("카드 정보를 불러오는 중 오류가 발생했습니다.");
        }
      });
    });

    document.querySelectorAll(".delete-card-btn").forEach(button => {
      button.addEventListener("click", async e => {
        e.stopPropagation();
        const cardId = button.dataset.cardId;
        if (confirm("이 카드를 삭제하시겠습니까?")) {
          try {
            const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}`, {
              method: "DELETE"
            });
            if (response.ok) {
              alert("카드가 삭제되었습니다.");
              await loadCards();
            } else {
              const error = await response.json();
              alert(error.message || "카드 삭제 실패");
            }
          } catch (err) {
            console.error("카드 삭제 오류:", err);
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
  function openChat(projectId, projectName) {
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
          console.log(`강제로 포커스: ${projectId}`);
        }, 100);
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
    makeDraggable(chatBox, chatBox.querySelector(`.chat-header`));

    chatBox.querySelector(`#minimizeChat-${projectId}`).addEventListener("click", (e) => {
      e.stopPropagation();
      const instance = chatInstances.get(projectId);
      instance.isMinimized = !instance.isMinimized;
      const chatBody = chatBox.querySelector(`.chat-body`);
      chatBody.style.display = instance.isMinimized ? "none" : "flex";
      chatBox.classList.toggle("minimized", instance.isMinimized);
      chatBox.querySelector(`#minimizeChat-${projectId}`).textContent = instance.isMinimized ? "🗖" : "🗕";
      if (instance.isMinimized) chatBox.querySelector(`.chat-header`).classList.remove("new-message");
    });

    chatBox.querySelector(`#chatClose-${projectId}`).addEventListener("click", (e) => {
      e.stopPropagation();
      socket.emit("leave", { project_id: projectId });
      chatBox.remove();
      chatInstances.delete(projectId);
    });

    const chatInput = chatBox.querySelector(`#chatInput-${projectId}`);
    const sendBtn = chatBox.querySelector(`#sendChatBtn-${projectId}`);
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const message = chatInput.value.trim();
      if (!message) return;
      socket.emit("send_message", { project_id: projectId, message }, (response) => {
        console.log(`메시지 전송 응답 ${projectId}:`, response);
      });
      chatInput.value = "";
      chatInput.focus();
    });

    chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;
        socket.emit("send_message", { project_id: projectId, message }, (response) => {
          console.log(`메시지 전송 응답 ${projectId}:`, response);
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
      }, 100);
    });

    socket.emit("join", { project_id: projectId }, (response) => {
      console.log(`참여 응답 ${projectId}:`, response);
    });
  }

  // 채팅 메시지 추가
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
      document.getElementById(`chatHeader-${projectId}`)?.classList.add("new-message");
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

  socket.on("chat_history", (history) => {
    history.forEach(data => {
      if (data.project_id) appendChatMessage(data.project_id, data.nickname, data.message, data.timestamp);
    });
  });

  socket.on("message", (data) => {
    if (data.project_id) appendChatMessage(data.project_id, data.nickname, data.message, data.timestamp);
  });

  socket.on("notice", (data) => {
    if (data.project_id) appendSystemMessage(data.project_id, data.msg);
  });

  socket.on("error", (err) => {
    console.error("Socket.IO 오류:", err);
    alert(`메시지 전송 실패: ${err.msg}`);
  });

  // 히스토리 로드
  async function loadHistory(projectId) {
    try {
      const loading = document.getElementById("history-loading");
      const historyList = document.getElementById("history-list");
      const arrow = document.getElementById("history-arrow");
      loading.style.display = "block";
      historyList.innerHTML = "";
      historyList.classList.remove("open");
      arrow.classList.remove("bi-caret-down-fill");
      arrow.classList.add("bi-caret-right-fill");

      const response = await fetch(`/history/${projectId}`, {
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      loading.style.display = "none";

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (!data.history || !Array.isArray(data.history) || data.history.length === 0) {
        const li = document.createElement("li");
        li.textContent = "히스토리가 없습니다.";
        historyList.appendChild(li);
        return;
      }

      data.history.forEach(entry => {
        let detailText = "";
        const isStatusUpdate = entry.action === "card_status_update";
        const isCardUpdate = entry.action === "card_update";
        const isCardMove = entry.action === "card_move_in" || entry.action === "card_move_out";
        let shouldDisplay = true;

        if (isCardMove) {
          shouldDisplay = !(entry.details.from_project === entry.details.to_project);
        }
        if (isCardUpdate) {
          shouldDisplay = entry.details.description;
        }

        if (shouldDisplay) {
          switch (entry.action) {
            case "update_deadline":
              detailText = entry.details.old_deadline
                ? `마감일 수정: ${entry.details.old_deadline} → ${entry.details.new_deadline}`
                : `마감일 설정: ${entry.details.new_deadline}`;
              break;
            case "create":
              detailText = entry.details.project_name
                ? `프로젝트 생성: ${entry.details.project_name}`
                : `알 수 없는 프로젝트 생성`;
              break;
            case "join":
              detailText = entry.details.project_name
                ? `프로젝트 참여: ${entry.details.project_name}`
                : `알 수 없는 프로젝트 참여`;
              break;
            case "leave":
              detailText = entry.details.project_name
                ? `프로젝트 떠남: ${entry.details.project_name}`
                : `알 수 없는 프로젝트 떠남`;
              break;
            case "card_create":
              detailText = entry.details.title
                ? `카드 생성: ${entry.details.title}${entry.details.status ? ` (상태: ${entry.details.status})` : ''}`
                : `알 수 없는 카드 생성`;
              break;
            case "card_delete":
              detailText = entry.details.title
                ? `카드 삭제: ${entry.details.title}`
                : `알 수 없는 카드 삭제`;
              break;
            case "card_move_in":
            case "card_move_out":
              detailText = entry.details.title
                ? `카드 이동: ${entry.details.title}, ${entry.details.from_project || '알 수 없음'} -> ${entry.details.to_project || '알 수 없음'}`
                : `알 수 없는 카드 이동`;
              break;
            case "card_status_update":
              detailText = entry.details.title
                ? `상태 변경: ${entry.details.from_status || '없음'} -> ${entry.details.to_status || '없음'} (${entry.details.title})`
                : `알 수 없는 상태 변경`;
              break;
            case "card_reorder":
              detailText = entry.details.title
                ? `카드 순서 변경: ${entry.details.title} (새 순서: ${entry.details.new_order || '알 수 없음'})`
                : `알 수 없는 순서 변경`;
              break;
            case "card_update":
              detailText = entry.details.description
                ? `카드 설명 수정: ${entry.details.description.from || '없음'} -> ${entry.details.description.to || '없음'}`
                : `알 수 없는 카드 수정`;
              break;
            default:
              detailText = `알 수 없는 작업: ${JSON.stringify(entry.details)}`;
          }
          const userLabel = entry.nickname || entry.user || "알 수 없음";
          const li = document.createElement("li");
          li.textContent = `${entry.created_at} ${userLabel}: ${detailText}`;
          historyList.appendChild(li);
        }
      });

      if (historyList.children.length > 0) {
        historyList.classList.add("open");
        arrow.classList.remove("bi-caret-right-fill");
        arrow.classList.add("bi-caret-down-fill");
      }
    } catch (error) {
      console.error("히스토리 로드 실패:", error);
      document.getElementById("history-loading").style.display = "none";
      historyList.innerHTML = "<li>히스토리를 불러오는 데 실패했습니다.</li>";
    }
  }

  // 댓글 로드
  async function loadComments(projectId) {
    if (!projectId) {
      console.error("댓글 로드에 프로젝트 ID 누락");
      return;
    }
    try {
      const res = await fetch(`/projects/${projectId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error(`댓글 로드 실패: ${res.status}`);
      const data = await res.json();
      const list = document.getElementById("comment-list");
      list.innerHTML = "";
      data.comments.forEach(comment => {
        const utcString = comment.created_at.includes('Z') ? comment.created_at : comment.created_at.replace(' ', 'T') + 'Z';
        const dateObj = new Date(utcString);
        const formattedTime = dateObj.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
        const isMine = comment.author_id === currentUser.id;
        list.innerHTML += `
          <div class="comment mb-2" data-id="${comment._id}">
            <b>${comment.author_name}</b>
            <span style="color:gray; font-size:small;">${formattedTime}</span><br>
            <span class="comment-content">${comment.content}</span>
            ${comment.image_url ? `<div class="mt-2"><img src="${comment.image_url}" class="img-fluid" style="max-height:200px;" /></div>` : ""}
            ${isMine ? `
              <button class="btn btn-sm btn-outline-secondary edit-comment-btn">수정</button>
              <button class="btn btn-sm btn-outline-danger delete-comment-btn">삭제</button>
            ` : ""}
          </div>`;
      });
    } catch (err) {
      console.error("댓글 로드 오류:", err);
      alert("댓글을 불러오는 데 실패했습니다.");
    }
  }

  // 댓글 이벤트 위임
  document.getElementById('comment-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const commentDiv = btn.closest('.comment');
    const commentId = commentDiv.dataset.id;
    const projectId = document.getElementById('projectBoardModal').dataset.projectId;

    if (btn.classList.contains('edit-comment-btn')) {
      startInlineEdit(commentDiv);
    } else if (btn.classList.contains('save-comment-btn')) {
      await saveInlineEdit(commentDiv, projectId);
    } else if (btn.classList.contains('cancel-comment-btn')) {
      cancelInlineEdit(commentDiv);
    } else if (btn.classList.contains('delete-comment-btn')) {
      if (confirm("정말 삭제할까요?")) {
        await deleteComment(commentId, projectId);
      }
    }
  });

  function startInlineEdit(div) {
    if (div.querySelector('textarea')) return;
    const span = div.querySelector('.comment-content');
    const origImg = div.querySelector('img');
    span.style.display = 'none';
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control mb-2';
    textarea.value = span.textContent;
    textarea.rows = 2;
    div.appendChild(textarea);
    let fileInput, removeCheckbox, removeLabel;
    if (origImg) {
      origImg.style.display = 'none';
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'form-control form-control-sm mb-2';
      div.appendChild(fileInput);
      removeCheckbox = document.createElement('input');
      removeCheckbox.type = 'checkbox';
      removeCheckbox.id = `rm-img-${div.dataset.id}`;
      removeCheckbox.className = 'form-check-input me-1';
      removeLabel = document.createElement('label');
      removeLabel.htmlFor = removeCheckbox.id;
      removeLabel.textContent = '이미지 삭제';
      removeLabel.className = 'form-check-label mb-2';
      const rmContainer = document.createElement('div');
      rmContainer.className = 'form-check mb-2';
      rmContainer.append(removeCheckbox, removeLabel);
      div.appendChild(rmContainer);
    }
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-sm btn-primary me-1 save-comment-btn';
    saveBtn.textContent = '저장';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm btn-secondary cancel-comment-btn';
    cancelBtn.textContent = '취소';
    const btnGroup = document.createElement('div');
    btnGroup.className = 'mb-2';
    btnGroup.append(saveBtn, cancelBtn);
    div.appendChild(btnGroup);
  }

  async function saveInlineEdit(div, projectId) {
    const textarea = div.querySelector('textarea');
    const newText = textarea.value.trim();
    if (!newText) return alert('댓글 내용을 입력하세요.');
    const origImg = div.querySelector('img');
    const fileInput = div.querySelector('input[type=file]');
    const removeCheckbox = div.querySelector('.form-check-input');
    let res;
    if ((fileInput && fileInput.files.length) || (removeCheckbox && removeCheckbox.checked)) {
      const formData = new FormData();
      formData.append('content', newText);
      if (fileInput.files.length) formData.append('image', fileInput.files[0]);
      if (removeCheckbox.checked) formData.append('delete_image', '1');
      res = await fetch(`/comments/${div.dataset.id}`, {
        method: 'PUT',
        body: formData,
        credentials: 'include'
      });
    } else {
      res = await fetch(`/comments/${div.dataset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText }),
        credentials: 'include'
      });
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return alert(err.error || '수정 실패');
    }
    div.querySelector('.comment-content').textContent = newText;
    if (origImg) {
      if (removeCheckbox && removeCheckbox.checked) {
        origImg.remove();
      } else if (fileInput && fileInput.files.length) {
        origImg.src = URL.createObjectURL(fileInput.files[0]);
      }
      origImg.style.display = '';
    }
    cancelInlineEdit(div);
  }

  function cancelInlineEdit(div) {
    div.querySelectorAll('textarea, .form-check, .save-comment-btn, .cancel-comment-btn, input[type=file]').forEach(el => el.remove());
    div.querySelector('.comment-content').style.display = '';
    const img = div.querySelector('img');
    if (img) img.style.display = '';
  }

  async function deleteComment(commentId, projectId) {
    await fetch(`/comments/${commentId}`, { method: 'DELETE', credentials: 'include' });
    loadComments(projectId);
  }

  document.getElementById('add-comment-btn')?.addEventListener('click', async () => {
    const contentInput = document.getElementById('new-comment-content');
    const fileInput = document.getElementById('new-comment-image');
    const content = contentInput.value.trim();
    const projectId = document.getElementById('projectBoardModal').dataset.projectId;
    if (!content && !fileInput.files.length) {
      alert("댓글 또는 이미지를 입력하세요.");
      return;
    }
    if (!projectId) {
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }
    const formData = new FormData();
    if (content) formData.append('content', content);
    if (fileInput.files.length) formData.append('image', fileInput.files[0]);
    try {
      const res = await fetch(`/projects/${projectId}/comments`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "댓글 추가 실패");
        return;
      }
      contentInput.value = '';
      fileInput.value = '';
      loadComments(projectId);
    } catch (err) {
      console.error("댓글 추가 오류:", err);
      alert("댓글 추가 중 오류가 발생했습니다.");
    }
  });

  // 드래그 앤 드롭
  function initializeDragAndDrop() {
    const container = document.querySelector(".project-scroll-container");
    const kanbanBoard = document.querySelector(".kanban-board");
    container?.addEventListener("wheel", e => {
      if (!isDragging) {
        e.preventDefault();
        container.scrollLeft += e.deltaY * 0.5;
      }
    });
    kanbanBoard?.addEventListener("wheel", e => {
      if (!isDragging) {
        e.preventDefault();
        kanbanBoard.scrollLeft += e.deltaY * 0.5;
      }
    });

    const cards = container.querySelectorAll(".project-card-wrapper");
    cards.forEach(card => {
      card.addEventListener("mousedown", e => {
        if (e.target.closest('.task-card')) return;
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startY = e.clientY;
        dragTimer = setTimeout(() => {
          startProjectDrag(card, e.clientX, e.clientY);
        }, 200);
      });

      card.addEventListener("mousemove", e => {
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

      card.addEventListener("touchstart", e => {
        if (e.target.closest('.task-card')) return;
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        dragTimer = setTimeout(() => {
          startProjectDrag(card, touch.clientX, touch.clientY);
        }, 300);
      });

      card.addEventListener("touchmove", e => {
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
      const containerRect = container.getBoundingClientRect();
      const scrollSpeed = 20;
      const edgeThreshold = 50;

      if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);

      function scrollStep() {
        if (!isDragging) return;
        if (x < containerRect.left + edgeThreshold) {
          container.scrollLeft -= scrollSpeed;
        } else if (x > containerRect.right - edgeThreshold) {
          container.scrollLeft += scrollSpeed;
        }
        const target = document.elementFromPoint(x, y);
        const targetCard = target?.closest(".project-card-wrapper");
        if (targetCard && targetCard !== dragged && !targetCard.classList.contains("drag-clone")) {
          const cardRect = targetCard.getBoundingClientRect();
          const insertBeforeTarget = x < cardRect.left + cardRect.width / 2;
          if (insertBeforeTarget) {
            container.insertBefore(dragged, targetCard);
          } else {
            if (targetCard.nextSibling) {
              container.insertBefore(dragged, targetCard.nextSibling);
            } else {
              container.appendChild(dragged);
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
      const order = Array.from(container.querySelectorAll(".project-card-wrapper"))
        .map(card => card.getAttribute("data-project-id"));
      localStorage.setItem("projectOrder", JSON.stringify(order));
    }

    const containers = document.querySelectorAll('.card-container');
    containers.forEach(container => {
      container.addEventListener('dragover', handleCardDragOver);
      container.addEventListener('dragenter', handleCardDragEnter);
      container.addEventListener('dragleave', handleCardDragLeave);
      container.addEventListener('drop', handleCardDrop);
    });

    function handleCardDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }

    function handleCardDragEnter(e) {
      e.preventDefault();
      e.stopPropagation();
      const container = e.target.closest('.card-container');
      if (container && draggedCard) {
        container.classList.add('drag-over');
        const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
        const dropY = e.clientY;
        const closestCard = cards.reduce((closest, card) => {
          const box = card.getBoundingClientRect();
          const offset = dropY - (box.top + box.height / 2);
          if (offset < 0 && offset > closest.offset) {
            return { offset, element: card };
          }
          return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;

        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        if (closestCard) {
          container.insertBefore(placeholder, closestCard);
        } else {
          container.appendChild(placeholder);
        }
      }
    }

    function handleCardDragLeave(e) {
      e.stopPropagation();
      const container = e.target.closest('.card-container');
      if (container) container.classList.remove('drag-over');
    }

    async function handleCardDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      const container = e.target.closest('.card-container');
      if (!container || !draggedCard) {
        if (draggedCard) draggedCard.style.display = 'block';
        if (placeholder) placeholder.remove();
        return;
      }
      container.classList.remove('drag-over');
      const cardId = e.dataTransfer.getData('text/plain');
      const targetProjectId = container.dataset.projectId;
      if (placeholder && placeholder.parentNode === container) {
        container.replaceChild(draggedCard, placeholder);
      } else {
        container.appendChild(draggedCard);
      }
      draggedCard.style.display = 'block';
      if (placeholder) {
        placeholder.remove();
        placeholder = null;
      }
      await updateCardProjectAndOrder(cardId, targetProjectId, container);
    }

    async function updateCardProjectAndOrder(cardId, targetProjectId, container) {
      const cards = [...container.querySelectorAll('.task-card')];
      const order = cards.map(card => card.dataset.cardId);
      try {
        const sourceProjectId = draggedCard?.dataset.projectId;
        if (!sourceProjectId || !cardId || !targetProjectId) {
          throw new Error('프로젝트 또는 카드 ID 누락');
        }
        const payload = { cardId, projectId: targetProjectId, sourceProjectId, order };
        const response = await fetch(`/projects/${sourceProjectId}/cards/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          alert(errorData.message || '카드 이동/순서 업데이트 실패');
          return;
        }
        if (draggedCard) draggedCard.dataset.projectId = targetProjectId;
        await loadHistory(sourceProjectId);
        await loadHistory(targetProjectId);
        loadCards();
      } catch (error) {
        console.error('카드 이동 오류:', error);
        alert('카드 이동/순서 업데이트 중 오류: ' + error.message);
      }
    }
  }

  function handleCardDragStart(e) {
    e.stopPropagation();
    draggedCard = e.target.closest('.task-card');
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
    e.dataTransfer.effectAllowed = 'move';
    placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder';
    placeholder.style.height = `${draggedCard.offsetHeight}px`;
    setTimeout(() => draggedCard.style.display = 'none', 0);
  }

  function handleCardDragEnd(e) {
    e.stopPropagation();
    if (draggedCard) {
      draggedCard.classList.remove('dragging');
      draggedCard.style.display = 'block';
    }
    if (placeholder) {
      placeholder.remove();
      placeholder = null;
    }
    document.querySelectorAll('.card-container').forEach(container => {
      container.classList.remove('drag-over');
    });
    draggedCard = null;
  }

  async function loadProjectOrder() {
    try {
      const response = await fetch("/projects/order", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        const order = data.order;
        const container = document.querySelector(".project-scroll-container");
        if (!container) return;
        const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
        order.forEach(projectId => {
          const card = cards.find(c => c.dataset.projectId === projectId);
          if (card) container.appendChild(card);
        });
      }
    } catch (err) {
      console.error("프로젝트 순서 로드 오류:", err);
    }
  }

  loadProjectOrder();
  loadCards();
  isDashboardInitialized = true;
  console.log("대시보드 초기화 완료");
}

document.addEventListener("DOMContentLoaded", initializeDashboard);