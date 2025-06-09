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
    // 폼 제출 이벤트
    createCardForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // 기본 제출 방지

      console.log("createCardForm 제출, projectId:", window.currentProjectId); // 디버깅 로그
      createCardBtn.disabled = true;

      const formData = new FormData(createCardForm);
      const data = {
        title: formData.get("title"),
        description: formData.get("description"),
        status: formData.get("status") || "todo",
        project_id: formData.get('projectId') || window.currentProjectId
      };

      console.log("카드 생성 데이터:", data); // 디버깅 로그

      try {
        const response = await fetch(`/projects/${window.currentProjectId}/cards`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(data)
        });

        console.log("data : ", data); // 디버깅 로그
        if (!response.ok) {
          const err = await response.json();
          alert(err.message || "카드 생성 실패");
          return;
        }

        const newCard = await response.json();

        // 생성된 카드 DOM에 추가
        const container = document.querySelector(`.project-card-wrapper[data-project-id="${newCard.project_id}"] .card-container`);
        const cardElement = createCardElement(newCard, false); // 드래그 가능
        container.appendChild(cardElement);

        bootstrap.Modal.getInstance(document.getElementById("createCardModal")).hide();
        createCardForm.reset();
        socket.emit('create_card', {
          project_id: data.project_id,
          card: newCard
        });
      } catch (err) {
        console.error("Create card error:", err);
        alert("카드 생성 중 오류가 발생했습니다.");
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

  // WebSocket 이벤트 리스너
  socket.on('card_created', (data) => {
    console.log("card_created 이벤트 수신:", data); // 디버깅 로그
    appendCardToDOM(data.card, false); // 메인 대시보드에 카드 추가
  });

  socket.on('card_updated', (data) => {
    console.log("card_updated 이벤트 수신:", data); // 디버깅 로그
    const { project_id, card_id, updates } = data;
    const cardElement = document.querySelector(`[data-card-id="${card_id}"]`);
    const modalCard = document.querySelector(`#projectBoardModal [data-card-id="${card_id}"]`);

    const statusClasses = {
      todo: "bg-primary",
      in_progress: "bg-warning",
      done: "bg-success"
    };
    const statusText = {
      todo: "To Do",
      in_progress: "In Progress",
      done: "Done"
    }[updates.status] || updates.status;

    if (cardElement) {
      cardElement.dataset.status = updates.status;
      const badge = cardElement.querySelector(".badge");
      badge.className = `badge ${statusClasses[updates.status] || "bg-secondary"} mt-2`;
      badge.textContent = statusText;
      cardElement.querySelector(".card-title").textContent = updates.title;
    }

    if (modalCard) {
      modalCard.dataset.status = updates.status;
      const modalBadge = modalCard.querySelector(".badge");
      modalBadge.className = `badge ${statusClasses[updates.status] || "bg-secondary"} mt-2`;
      modalBadge.textContent = statusText;
      modalCard.querySelector(".card-title").textContent = updates.title;
      modalCard.querySelector(".card-description").textContent = updates.description;
    }

    loadHistory(project_id); // 히스토리 새로고침
  });

  socket.on('card_deleted', (data) => {
    console.log("card_deleted 이벤트 수신:", data); // 디버깅 로그
    loadCards(); // 카드 목록 새로고침
  });

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

  // 드래그 이벤트 리스너 (메인 대시보드에서만)
  if (!isModal) {
    cardElement.addEventListener("dragstart", handleCardDragStart);
    cardElement.addEventListener("dragend", handleCardDragEnd);
  }

  return cardElement;
}


function initializeCardButtons() {
  // 기존 이벤트 리스너 제거
  document.querySelectorAll(".edit-card-btn").forEach(button => {
    button.replaceWith(button.cloneNode(true));
  });
  document.querySelectorAll(".delete-card-btn").forEach(button => {
    button.replaceWith(button.cloneNode(true));
  });

  // 수정 버튼 이벤트 리스너
  document.querySelectorAll(".edit-card-btn").forEach(button => {
    button.addEventListener("click", async e => {
      e.stopPropagation();
      const cardId = button.dataset.cardId;
      const projectId = button.closest('.project-card-wrapper')?.dataset.projectId || window.currentProjectId;
      
      console.log("카드 수정 버튼 클릭:", { cardId, projectId, currentProjectId: window.currentProjectId }); // 디버깅 로그
      
      if (!projectId) {
        console.error("프로젝트 ID를 찾을 수 없습니다.");
        alert("프로젝트 ID를 찾을 수 없습니다.");
        return;
      }

      if (!cardId) {
        console.error("카드 ID를 찾을 수 없습니다.");
        alert("카드 ID를 찾을 수 없습니다.");
        return;
      }

      try {
        console.log(`카드 정보 요청: /projects/${projectId}/cards/${cardId}`); // 디버깅 로그
        const response = await fetch(`/projects/${projectId}/cards/${cardId}`, {
          method: "GET",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          credentials: "include"
        });

        console.log("서버 응답 상태:", response.status); // 디버깅 로그

        if (response.ok) {
          const card = await response.json();
          console.log("카드 정보 로드 성공:", card); // 디버깅 로그
          
          const form = document.getElementById("editCardForm");
          if (!form) {
            console.error("editCardForm을 찾을 수 없습니다.");
            alert("폼을 찾을 수 없습니다.");
            return;
          }

          const titleInput = form.querySelector("[name='title']");
          const descriptionInput = form.querySelector("[name='description']");
          const statusInput = form.querySelector("[name='status']");
          const cardIdInput = document.getElementById("editCardId");

          if (!titleInput || !descriptionInput || !statusInput || !cardIdInput) {
            console.error("필요한 폼 요소를 찾을 수 없습니다.");
            alert("폼 구성 요소를 찾을 수 없습니다.");
            return;
          }

          titleInput.value = card.title || "";
          descriptionInput.value = card.description || "";
          statusInput.value = card.status || "todo";
          cardIdInput.value = card.id;
          
          form.dataset.projectId = projectId;
          
          const modal = document.getElementById("editCardModal");
          if (!modal) {
            console.error("editCardModal을 찾을 수 없습니다.");
            alert("수정 모달을 찾을 수 없습니다.");
            return;
          }

          // 기존 updateCard 버튼 이벤트 리스너 제거
          const updateCardBtn = document.getElementById("updateCard");
          const newUpdateCardBtn = updateCardBtn.cloneNode(true);
          updateCardBtn.parentNode.replaceChild(newUpdateCardBtn, updateCardBtn);

          // 새로운 이벤트 리스너 등록
          newUpdateCardBtn.addEventListener("click", async () => {
            const form = document.getElementById("editCardForm");
            const cardId = document.getElementById("editCardId").value;
            const projectId = form.dataset.projectId || window.currentProjectId;
            
            console.log("카드 수정 요청:", { cardId, projectId, currentProjectId: window.currentProjectId }); // 디버깅 로그
            
            if (!projectId) {
              console.error("프로젝트 ID를 찾을 수 없습니다.");
              alert("프로젝트 ID를 찾을 수 없습니다.");
              return;
            }

            const formData = new FormData(form);
            const data = {
              project_id: projectId,
              card_id: cardId,
              updates: {
                title: formData.get("title"),
                description: formData.get("description"),
                status: formData.get("status")
              }
            };

            try {
              // WebSocket 이벤트로 카드 수정
              socket.emit('update_card', data);
              bootstrap.Modal.getInstance(document.getElementById("editCardModal")).hide();
              form.reset();
            } catch (err) {
              console.error("Update card error:", err);
              alert("카드 수정 중 오류가 발생했습니다.");
            }
          });

          new bootstrap.Modal(modal).show();
        } else {
          let errorMessage = "카드 정보를 불러오는 중 오류가 발생했습니다.";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
            console.error("카드 정보 로드 실패:", errorData); // 디버깅 로그
          } catch (parseError) {
            console.error("응답 파싱 실패:", parseError);
            console.error("원본 응답:", await response.text());
          }
          alert(errorMessage);
        }
      } catch (err) {
        console.error("카드 정보 로드 중 예외 발생:", err);
        alert("카드 정보를 불러오는 중 오류가 발생했습니다. 콘솔 로그를 확인해주세요.");
      }
    });
  });

  // 삭제 버튼 이벤트 리스너
  document.querySelectorAll(".delete-card-btn").forEach(button => {
    button.addEventListener("click", async e => {
      e.stopPropagation();
      const cardId = button.dataset.cardId;
      if (confirm("이 카드를 삭제하시겠습니까?")) {
        try {
          // WebSocket 이벤트로 카드 삭제
          socket.emit('delete_card', {
            project_id: window.currentProjectId,
            card_id: cardId
          });
        } catch (err) {
          console.error("Delete card error:", err);
          alert("카드 삭제 중 오류가 발생했습니다.");
        }
      }
    });
  });
}