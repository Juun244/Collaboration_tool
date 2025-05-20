async function loadCards() {
    try {
      if (!window.currentProjectId) {
        console.error("현재 프로젝트 ID가 설정되지 않았습니다.");
        return;
      }

      const response = await fetch(`/projects/${window.currentProjectId}/cards`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "카드 로드 실패");
      }
      const data = await response.json();
      const cards = data.cards;

      // 메인 대시보드의 카드 컨테이너 초기화
      const mainContainer = document.querySelector(`.project-card-wrapper[data-project-id="${window.currentProjectId}"] .card-container`);
      if (mainContainer) {
        mainContainer.innerHTML = "";
      }

      // 프로젝트 보드 모달의 카드 컨테이너들 초기화
      document.querySelectorAll('#projectBoardModal .card-container').forEach(container => {
        container.innerHTML = "";
      });

      // 카드를 상태별로 분류하여 표시
      cards.forEach(card => {
        // 메인 대시보드에 카드 표시
        if (mainContainer) {
          const mainCardElement = createCardElement(card);
          mainContainer.appendChild(mainCardElement);
        }

        // 프로젝트 보드 모달에 카드 표시
        const modalContainer = document.querySelector(`#projectBoardModal .card-container[data-status="${card.status}"]`);
        if (modalContainer) {
          const modalCardElement = createCardElement(card);
          modalContainer.appendChild(modalCardElement);
        }
      });

      // 카드 수정/삭제 버튼 이벤트 리스너 등록
      initializeCardButtons();
    } catch (err) {
      console.error("Load cards error:", err);
      alert("카드 로드 중 오류가 발생했습니다.");
    }
  }

// 전역 변수로 이벤트 리스너 등록 여부를 추적
let isInitialized = false;
let createCardListener = null;
let updateCardListener = null;

function initializeCards() {
  // 이미 초기화되었다면 중복 실행 방지
  if (isInitialized) {
    console.log('이미 초기화되어 있습니다.');
    return;
  }

  // 기존 이벤트 리스너 제거
  const createCardBtn = document.getElementById("createCard");
  const updateCardBtn = document.getElementById("updateCard");

  if (createCardBtn && createCardListener) {
    createCardBtn.removeEventListener("click", createCardListener);
  }
  if (updateCardBtn && updateCardListener) {
    updateCardBtn.removeEventListener("click", updateCardListener);
  }

  // 카드 생성 이벤트
  if (createCardBtn) {
    createCardListener = async () => {
      const form = document.getElementById("createCardForm");
      const formData = new FormData(form);
      
      // 프로젝트 보드 모달에서 생성하는 경우, 해당 상태칸의 상태값 사용
      const createCardModal = document.getElementById("createCardModal");
      let status;
      
      // 프로젝트 보드 모달에서 생성하는 경우
      if (createCardModal.closest('#projectBoardModal')) {
        const activeButton = document.querySelector('#projectBoardModal .add-card-btn.active');
        if (activeButton) {
          status = activeButton.closest('.kanban-column').dataset.status;
        }
      } else {
        // 메인 대시보드에서 생성하는 경우
        status = formData.get("status");
      }

      // 상태값이 없는 경우 에러 처리
      if (!status) {
        alert("카드 상태를 선택해주세요.");
        return;
      }

      const data = {
        title: formData.get("title"),
        description: formData.get("description"),
        status: status
      };

      console.log("Creating card with status:", status); // 디버깅용 로그

      try {
        const response = await fetch(`/projects/${window.currentProjectId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          const newCard = await response.json();
          console.log("Created card:", newCard); // 디버깅용 로그
          alert("카드가 생성되었습니다!");
          bootstrap.Modal.getInstance(createCardModal).hide();
          form.reset();
          
          // 프로젝트 보드 모달의 카드 컨테이너에 카드 추가
          const modalContainer = document.querySelector(`#projectBoardModal .card-container[data-status="${status}"]`);
          if (modalContainer) {
            const modalCardElement = createCardElement(newCard);
            modalContainer.appendChild(modalCardElement);
          }

          // 메인 대시보드의 카드 컨테이너에 카드 추가
          const mainContainer = document.querySelector(
            `.project-card-wrapper[data-project-id="${window.currentProjectId}"] .card-container`
          );
          if (mainContainer) {
            const mainCardElement = createCardElement(newCard);
            mainContainer.appendChild(mainCardElement);
          }

          // 카드 버튼 이벤트 리스너 등록
          initializeCardButtons();
        } else {
          const error = await response.json();
          alert(error.message || "카드 생성 실패");
        }
      } catch (err) {
        console.error("Create card error:", err);
        alert("오류가 발생했습니다.");
      }
    };
    createCardBtn.addEventListener("click", createCardListener);
  }

  // 카드 수정 이벤트
  if (updateCardBtn) {
    updateCardListener = async () => {
      const form = document.getElementById("editCardForm");
      const formData = new FormData(form);
      const cardId = document.getElementById("editCardId").value;
      const data = {
        title: formData.get("title"),
        description: formData.get("description"),
        status: formData.get("status")
      };

      try {
        const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          alert("카드가 수정되었습니다!");
          bootstrap.Modal.getInstance(document.getElementById("editCardModal")).hide();
          form.reset();
          await loadCards();
        } else {
          const error = await response.json();
          alert(error.message || "카드 수정 실패");
        }
      } catch (err) {
        console.error("Update card error:", err);
        alert("오류가 발생했습니다.");
      }
    };
    updateCardBtn.addEventListener("click", updateCardListener);
  }

  // 카드 드래그 앤 드롭 이벤트
  document.querySelectorAll('.card-container').forEach(container => {
    container.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('drop', async e => {
      await handleCardDrop(e);
    });
  });

  // 초기화 완료 표시
  isInitialized = true;
  console.log('카드 초기화가 완료되었습니다.');

  // 초기 카드 로드
  loadCards();
}

// 카드 드래그 시작 이벤트
function handleCardDragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.cardId);
  e.target.classList.add('dragging');
}

// 카드 드래그 종료 이벤트
function handleCardDragEnd(e) {
  e.target.classList.remove('dragging');
}

// 카드 요소 생성 함수
function createCardElement(card) {
  const cardElement = document.createElement("div");
  cardElement.className = "task-card";
  cardElement.dataset.cardId = card.id;
  cardElement.dataset.projectId = card.project_id;
  cardElement.dataset.status = card.status;
  cardElement.draggable = true;

  // 카드 HTML 구조 생성
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
  `;

  // 드래그 이벤트 리스너 등록
  cardElement.addEventListener("dragstart", handleCardDragStart);
  cardElement.addEventListener("dragend", handleCardDragEnd);

  // 수정 버튼 이벤트 리스너
  const editBtn = cardElement.querySelector('.edit-card-btn');
  editBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/projects/${card.project_id}/cards/${card.id}`);
      if (response.ok) {
        const cardData = await response.json();
        const form = document.getElementById("editCardForm");
        form.querySelector("[name='title']").value = cardData.title;
        form.querySelector("[name='description']").value = cardData.description;
        form.querySelector("[name='status']").value = cardData.status;
        document.getElementById("editCardId").value = cardData.id;
        new bootstrap.Modal(document.getElementById("editCardModal")).show();
      }
    } catch (err) {
      console.error("Edit card error:", err);
      alert("카드 정보를 불러오는 중 오류가 발생했습니다.");
    }
  });

  // 삭제 버튼 이벤트 리스너
  const deleteBtn = cardElement.querySelector('.delete-card-btn');
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm("이 카드를 삭제하시겠습니까?")) {
      try {
        const response = await fetch(`/projects/${card.project_id}/cards/${card.id}`, {
          method: "DELETE"
        });
        if (response.ok) {
          alert("카드가 삭제되었습니다.");
          loadCards();
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

  return cardElement;
}

// 카드 버튼 이벤트 리스너 초기화 함수
function initializeCardButtons() {
  // 카드 수정 버튼 이벤트
  document.querySelectorAll(".edit-card-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const cardId = button.dataset.cardId;
      const response = await fetch(`/projects/${window.currentProjectId}/cards`);
      if (response.ok) {
        const data = await response.json();
        const card = data.cards.find(c => c.id === cardId);
        if (card) {
          const form = document.getElementById("editCardForm");
          form.querySelector("[name='title']").value = card.title;
          form.querySelector("[name='description']").value = card.description;
          form.querySelector("[name='status']").value = card.status;
          document.getElementById("editCardId").value = cardId;
          new bootstrap.Modal(document.getElementById("editCardModal")).show();
        }
      }
    });
  });

  // 카드 삭제 버튼 이벤트
  document.querySelectorAll(".delete-card-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const cardId = button.dataset.cardId;
      if (confirm("이 카드를 삭제하시겠습니까?")) {
        try {
          const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}`, {
            method: "DELETE"
          });
          if (response.ok) {
            alert("카드가 삭제되었습니다.");
            loadCards();
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

async function handleCardDrop(e) {
  e.preventDefault();
  const container = e.target.closest('.card-container');
  if (!container) {
    console.error('드롭 대상 컨테이너를 찾을 수 없습니다.');
    return;
  }

  const cardId = e.dataTransfer.getData('text/plain');
  const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
  const newStatus = container.dataset.status;

  if (!cardId || !cardElement || !newStatus) {
    console.error('필수 데이터가 누락되었습니다:', { cardId, cardElement: !!cardElement, newStatus });
    return;
  }

  // 이미 같은 상태로 드롭된 경우 무시
  if (cardElement.dataset.status === newStatus) {
    return;
  }

  // 드래그 중인 카드의 원래 컨테이너 찾기
  const originalContainer = cardElement.closest('.card-container');
  if (!originalContainer) {
    console.error('원래 카드 컨테이너를 찾을 수 없습니다.');
    return;
  }

  try {
    console.log('카드 상태 업데이트 시도:', { cardId, newStatus });
    
    // 카드 요소를 임시로 숨김
    cardElement.style.opacity = '0.5';
    
    const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}/status`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ 
        status: newStatus,
        project_id: window.currentProjectId
      })
    });

    const responseData = await response.json();
    
    if (response.ok) {
      console.log('카드 상태 업데이트 성공:', responseData);
      
      // 현재 드래그 중인 카드의 정보 저장
      const draggedCardTitle = cardElement.querySelector('.card-title').textContent;
      const draggedCardDescription = cardElement.querySelector('.card-description').textContent;
      
      // 프로젝트 보드 모달과 메인 대시보드의 카드 컨테이너 찾기
      const modalContainer = document.querySelector(`#projectBoardModal .card-container[data-status="${newStatus}"]`);
      const mainContainer = document.querySelector(
        `.project-card-wrapper[data-project-id="${window.currentProjectId}"] .card-container`
      );

      if (!modalContainer && !mainContainer) {
        console.error('카드 컨테이너를 찾을 수 없습니다:', { newStatus, projectId: window.currentProjectId });
        return;
      }

      // 기존 카드 제거 (모든 컨테이너에서)
      document.querySelectorAll(`[data-card-id="${cardId}"]`).forEach(card => {
        card.remove();
      });

      // 프로젝트 보드 모달에서 드래그한 경우
      if (container.closest('#projectBoardModal')) {
        // 메인 대시보드의 카드 업데이트
        if (mainContainer) {
          const mainCard = createCardElement({ 
            id: cardId, 
            title: draggedCardTitle, 
            description: draggedCardDescription 
          });
          mainContainer.appendChild(mainCard);
        }

        // 프로젝트 보드 모달의 카드 업데이트
        const modalCard = createCardElement({ 
          id: cardId, 
          title: draggedCardTitle, 
          description: draggedCardDescription 
        }, true);
        container.appendChild(modalCard);

      } else {
        // 메인 대시보드에서 드래그한 경우
        if (modalContainer) {
          const modalCard = createCardElement({ 
            id: cardId, 
            title: draggedCardTitle, 
            description: draggedCardDescription 
          }, true);
          modalContainer.appendChild(modalCard);
        }
        const mainCard = createCardElement({ 
          id: cardId, 
          title: draggedCardTitle, 
          description: draggedCardDescription 
        });
        container.appendChild(mainCard);
      }

      // 모달 내의 모든 카드에 대해 이벤트 리스너 재등록
      if (container.closest('#projectBoardModal')) {
        document.querySelectorAll('#projectBoardModal .task-card').forEach(card => {
          const cardId = card.dataset.cardId;
          const editBtn = card.querySelector('.edit-card-btn');
          const deleteBtn = card.querySelector('.delete-card-btn');

          // 기존 이벤트 리스너 제거
          editBtn.replaceWith(editBtn.cloneNode(true));
          deleteBtn.replaceWith(deleteBtn.cloneNode(true));

          // 새로운 이벤트 리스너 등록
          const newEditBtn = card.querySelector('.edit-card-btn');
          const newDeleteBtn = card.querySelector('.delete-card-btn');

          newEditBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            try {
              const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}`);
              if (response.ok) {
                const cardData = await response.json();
                const form = document.getElementById("editCardForm");
                form.querySelector("[name='title']").value = cardData.title;
                form.querySelector("[name='description']").value = cardData.description;
                form.querySelector("[name='status']").value = cardData.status;
                document.getElementById("editCardId").value = cardData.id;
                new bootstrap.Modal(document.getElementById("editCardModal")).show();
              }
            } catch (err) {
              console.error("Edit card error:", err);
              alert("카드 정보를 불러오는 중 오류가 발생했습니다.");
            }
          });

          newDeleteBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (confirm("이 카드를 삭제하시겠습니까?")) {
              try {
                const response = await fetch(`/projects/${window.currentProjectId}/cards/${cardId}`, {
                  method: "DELETE"
                });
                if (response.ok) {
                  alert("카드가 삭제되었습니다.");
                  card.remove();
                  // 메인 대시보드의 카드도 업데이트
                  const mainCard = document.querySelector(`.project-card-wrapper[data-project-id="${window.currentProjectId}"] [data-card-id="${cardId}"]`);
                  if (mainCard) mainCard.remove();
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
    } else {
      console.error('카드 상태 업데이트 실패:', responseData);
      const errorMessage = responseData.message || '카드 상태 변경 실패';
      alert(errorMessage);
      
      // 실패 시 원래 상태로 되돌리기
      cardElement.style.opacity = '1';
      originalContainer.appendChild(cardElement);
    }
  } catch (err) {
    console.error("Update card status error:", err);
    alert("카드 상태 업데이트 중 오류가 발생했습니다. 다시 시도해주세요.");
    
    // 오류 발생 시 원래 상태로 되돌리기
    cardElement.style.opacity = '1';
    originalContainer.appendChild(cardElement);
  }
}
