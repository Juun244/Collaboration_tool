let isInitialized = false;

function initializeCards() {
  if (isInitialized) {
    console.log("이미 초기화되어 있습니다.");
    return;
  }

  console.log("initializeCards 호출됨"); // 디버깅 로그

  // 카드 생성 폼 이벤트
  const createCardForm = document.getElementById("createCardForm");
  const createCardBtn = document.getElementById("createCard");

  if (createCardForm && createCardBtn) {
    console.log("createCardForm과 createCardBtn 발견"); // 디버깅 로그
    // 폼 제출 이벤트
    createCardForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // 기본 제출 방지

      console.log("createCardForm 제출, projectId:", window.currentProjectId); // 디버깅 로그
      // 버튼 비활성화
      createCardBtn.disabled = true;

      const formData = new FormData(createCardForm);
      const status = formData.get("status") || "todo"; // 기본값
      const data = {
        title: formData.get("title"),
        description: formData.get("description"),
        status: status
      };

      try {
        const response = await fetch(`/projects/${window.currentProjectId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          const newCard = await response.json();
          alert("카드가 생성되었습니다!");
          bootstrap.Modal.getInstance(document.getElementById("createCardModal")).hide();
          createCardForm.reset();
          await loadCards(); // 카드, 히스토리, 댓글 새로고침
        } else {
          const error = await response.json();
          alert(error.message || "카드 생성 실패");
        }
      } catch (err) {
        console.error("Create card error:", err);
        alert("오류가 발생했습니다.");
      } finally {
        createCardBtn.disabled = false; // 버튼 재활성화
      }
    });

    // 버튼 클릭 시 폼 제출 트리거
    createCardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("createCard 버튼 클릭됨"); // 디버깅 로그
      createCardForm.dispatchEvent(new Event("submit")); // 폼 제출 이벤트 트리거
    });
  } else {
    console.error("createCardForm 또는 createCardBtn을 찾을 수 없음");
  }

  /*
  // 드래그 앤 드롭 이벤트 (메인 대시보드에만)
  const containers = document.querySelectorAll(".project-card-wrapper .card-container");
  console.log("드래그 앤 드롭 컨테이너 수:", containers.length); // 디버깅 로그
  containers.forEach(container => {
    container.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      console.log("dragover 이벤트 발생, 컨테이너:", container); // 디버깅 로그
    });
    container.addEventListener("drop", handleCardDrop);
  });
  */

  isInitialized = true;
  console.log("카드 초기화가 완료되었습니다.");
  loadCards();
}

async function loadCards() {
  try {
    // 메인 대시보드: 모든 프로젝트의 카드 로드
    const mainResponse = await fetch("/projects/all/cards");
    if (!mainResponse.ok) {
      const error = await mainResponse.json();
      throw new Error(error.message || "카드 로드 실패");
    }
    const mainData = await mainResponse.json();
    const allCards = mainData.cards;

    // 메인 대시보드의 모든 카드 컨테이너 초기화
    document.querySelectorAll(".project-card-wrapper .card-container").forEach(container => {
      container.innerHTML = "";
    });

    // 메인 대시보드에 카드 표시
    allCards.forEach(card => {
      const container = document.querySelector(`.project-card-wrapper[data-project-id="${card.project_id}"] .card-container`);
      if (container) {
        const cardElement = createCardElement(card, false); // 드래그 가능
        container.appendChild(cardElement);
      }
    });

    // 프로젝트 보드 모달: 현재 프로젝트의 카드 로드
    if (window.currentProjectId) {
      const modalResponse = await fetch(`/projects/${window.currentProjectId}/cards`);
      if (!modalResponse.ok) {
        const error = await modalResponse.json();
        throw new Error(error.message || "카드 로드 실패");
      }
      const modalData = await modalResponse.json();
      const projectCards = modalData.cards;

      // 모달의 카드 컨테이너 초기화
      const modalContainer = document.querySelector("#projectBoardModal .card-container");
      if (modalContainer) {
        modalContainer.innerHTML = "";
        projectCards.forEach(card => {
          const cardElement = createCardElement(card, true); // 드래그 불가
          modalContainer.appendChild(cardElement);
        });
      }

      // 히스토리와 댓글 로드
      await loadHistory(window.currentProjectId); // history.js
      await loadComments(window.currentProjectId); // projects.js
    }

    // 카드 버튼 이벤트 리스너 등록
    initializeCardButtons();
  } catch (err) {
    console.error("Load cards error:", err);
    alert("카드 로드 중 오류가 발생했습니다.");
  }
}

function createCardElement(card, isModal = false) {
  const cardElement = document.createElement("div");
  cardElement.className = "task-card";
  cardElement.dataset.cardId = card.id;
  cardElement.dataset.projectId = card.project_id;
  cardElement.dataset.status = card.status;

  // 메인 대시보드에서만 드래그 가능
  if (!isModal) {
    cardElement.draggable = true;
  }

  // 상태에 따라 배지 스타일 설정
  const statusClasses = {
    todo: "bg-primary",
    in_progress: "bg-warning",
    done: "bg-success"
  };
  const statusText = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done"
  }[card.status] || card.status;
  const statusClass = statusClasses[card.status] || "bg-secondary";

  // 카드 HTML 구조
  cardElement.innerHTML = `
    <div class="card-header">
      <h6 class="card-title">${card.title}</h6>
      <div class="card-buttons">
        <button type="button" class="btn btn-sm btn-outline-primary edit-card-btn" data-card-id="${card.id}">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger delete-card-btn" data-card-id="${card.id}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
    <p class="card-description">${card.description}</p>
    <span class="badge ${statusClass} mt-2">${statusText}</span>
  `;

  // 드래그 이벤트 리스너 (메인 대시보드에서만)
  if (!isModal) {
    cardElement.addEventListener("dragstart", handleCardDragStart);
    cardElement.addEventListener("dragend", handleCardDragEnd);
  }

  return cardElement;
}

/*
async function handleCardDrop(e) {
  e.preventDefault();
  const cardId = e.dataTransfer.getData("text/plain");
  const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
  const container = e.target.closest(".card-container");

  console.log("handleCardDrop 호출됨, cardId:", cardId, "container:", container); // 디버깅 로그

  if (!cardId || !cardElement || !container) {
    console.error("필수 데이터가 누락되었습니다:", { cardId, cardElement: !!cardElement, container: !!container });
    return;
  }

  // 상태 선택 (UI로 개선 권장)
  const newStatus = prompt("새로운 상태를 입력하세요 (todo, in_progress, done):", cardElement.dataset.status);
  if (!newStatus || newStatus === cardElement.dataset.status) {
    return;
  }

  try {
    cardElement.style.opacity = "0.5";
    const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, project_id: window.currentProjectId })
    });

    if (response.ok) {
      const responseData = await response.json();
      console.log("카드 상태 업데이트 성공:", responseData);

      // 상태 및 배지 업데이트
      cardElement.dataset.status = newStatus;
      const badge = cardElement.querySelector(".badge");
      const statusClasses = {
        todo: "bg-primary",
        in_progress: "bg-warning",
        done: "bg-success"
      };
      const statusText = {
        todo: "To Do",
        in_progress: "In Progress",
        done: "Done"
      }[newStatus] || newStatus;
      badge.className = `badge ${statusClasses[newStatus] || "bg-secondary"} mt-2`;
      badge.textContent = statusText;

      // 모달의 동일 카드 업데이트
      const modalCard = document.querySelector(`#projectBoardModal [data-card-id="${cardId}"]`);
      if (modalCard) {
        modalCard.dataset.status = newStatus;
        const modalBadge = modalCard.querySelector(".badge");
        modalBadge.className = `badge ${statusClasses[newStatus] || "bg-secondary"} mt-2`;
        modalBadge.textContent = statusText;
      }

      // 히스토리 업데이트
      await loadHistory(window.currentProjectId);
    } else {
      const error = await response.json();
      alert(error.message || "카드 상태 변경 실패");
    }
  } catch (err) {
    console.error("Update card status error:", err);
    alert("카드 상태 업데이트 중 오류가 발생했습니다.");
  } finally {
    cardElement.style.opacity = "1";
  }
}
  */

function initializeCardButtons() {
  document.querySelectorAll(".edit-card-btn").forEach(button => {
    button.addEventListener("click", async e => {
      e.stopPropagation();
      const cardId = button.dataset.cardId;
      try {
        const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}`);
        if (response.ok) {
          const card = await response.json();
          const form = document.getElementById("editCardForm");
          form.querySelector("[name='title']").value = card.title;
          form.querySelector("[name='description']").value = card.description;
          form.querySelector("[name='status']").value = card.status;
          document.getElementById("editCardId").value = card.id;
          new bootstrap.Modal(document.getElementById("editCardModal")).show();
        }
      } catch (err) {
        console.error("Edit card error:", err);
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
          console.error("Delete card error:", err);
          alert("오류가 발생했습니다.");
        }
      }
    });
  });
}