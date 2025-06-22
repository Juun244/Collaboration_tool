let isInitialized = false;

window.initializeCards = function() {
  if (isInitialized) {
    console.log("이미 초기화되어 있습니다.");
    return;
  }

  console.log("initializeCards 호출됨");

  const createCardForm = document.getElementById("createCardForm");
  const createCardBtn = document.getElementById("createCard");

  if (createCardForm && createCardBtn) {
    createCardForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("createCardForm 제출, projectId:", window.currentProjectId);
      createCardBtn.disabled = true;

      const formData = new FormData(createCardForm);
      const data = {
        title: formData.get("title"),
        description: formData.get("description"),
        status: formData.get("status") || "todo",
        project_id: formData.get('projectId') || window.currentProjectId
      };

      console.log("카드 생성 데이터:", data);

      try {
        const response = await fetch(`/projects/${window.currentProjectId}/cards`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          const err = await response.json();
          alert(err.message || "카드 생성 실패");
          return;
        }

        const newCard = await response.json();
        const container = document.querySelector(`.project-card-wrapper[data-project-id="${newCard.project_id}"] .card-container`);
        const cardElement = createCardElement(newCard, false);
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
        createCardBtn.disabled = false;
      }
    });

    createCardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("createCard 버튼 클릭됨");
      createCardForm.dispatchEvent(new Event("submit"));
    });
  } else {
    console.error("createCardForm 또는 createCardBtn을 찾을 수 없음");
  }

  socket.on('card_created', (data) => {
    console.log("card_created 이벤트 수신:", data);
    const container = document.querySelector(`.project-card-wrapper[data-project-id="${data.card.project_id}"] .card-container`);
    if (container) {
      const cardElement = createCardElement(data.card, false);
      container.appendChild(cardElement);
    }
  });

  socket.on('card_updated', (data) => {
    console.log("card_updated 이벤트 수신:", data);
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

    if (typeof loadHistory === 'function') {
      loadHistory(project_id);
    }
  });

  socket.on('card_deleted', (data) => {
    console.log("card_deleted 이벤트 수신:", data);
    loadCards();
  });

  isInitialized = true;
  console.log("카드 초기화가 완료되었습니다.");
  loadCards();
};

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

      if (typeof loadHistory === 'function') {
        await loadHistory(window.currentProjectId);
      }
      await loadComments(window.currentProjectId);
    }

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

  return cardElement;
}

function initializeCardButtons() {
  document.querySelectorAll(".edit-card-btn, .delete-card-btn").forEach(button => {
    button.replaceWith(button.cloneNode(true));
  });

  const modal = document.getElementById('projectBoardModal');
  if (modal) {
    modal.addEventListener('touchstart', handleCardButtonTouch, { passive: true });
    modal.addEventListener('click', handleCardButtonTouch, { passive: true });
  } else {
    console.error('projectBoardModal not found for card button events');
  }

  function handleCardButtonTouch(e) {
    const button = e.target.closest('.edit-card-btn, .delete-card-btn');
    if (!button) return;

    e.stopPropagation();
    console.log(`버튼 터치/클릭: ${button.className}, cardId: ${button.dataset.cardId}`);

    const cardId = button.dataset.cardId;
    let projectId = button.closest('.project-card-wrapper')?.dataset.projectId || window.currentProjectId;

    if (!projectId) {
      projectId = document.getElementById('projectBoardModal')?.dataset.projectId;
      console.warn('projectId 대체값 사용:', projectId);
    }

    if (!projectId) {
      console.error('프로젝트 ID를 찾을 수 없습니다:', { cardId, modalProjectId: document.getElementById('projectBoardModal')?.dataset.projectId });
      alert('프로젝트 ID를 찾을 수 없습니다.');
      return;
    }

    if (!cardId) {
      console.error('카드 ID를 찾을 수 없습니다.');
      alert('카드 ID를 찾을 수 없습니다.');
      return;
    }

    if (button.classList.contains('edit-card-btn')) {
      console.log('카드 수정 버튼 처리 시작:', { cardId, projectId });
      handleEditCard(button, cardId, projectId);
    } else if (button.classList.contains('delete-card-btn')) {
      console.log('카드 삭제 버튼 처리 시작:', { cardId, projectId });
      handleDeleteCard(cardId, projectId);
    }
  }

  async function handleEditCard(button, cardId, projectId) {
    try {
      console.log(`카드 정보 요청: /projects/${projectId}/cards/${cardId}`);
      const response = await fetch(`/projects/${projectId}/cards/${cardId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (response.ok) {
        const card = await response.json();
        console.log('카드 정보 로드 성공:', card);

        const form = document.getElementById('editCardForm');
        if (!form) {
          console.error('editCardForm을 찾을 수 없습니다.');
          alert('폼을 찾을 수 없습니다.');
          return;
        }

        const titleInput = form.querySelector('[name="title"]');
        const descriptionInput = form.querySelector('[name="description"]');
        const statusInput = form.querySelector('[name="status"]');
        const cardIdInput = document.getElementById('editCardId');

        if (!titleInput || !descriptionInput || !statusInput || !cardIdInput) {
          console.error('필요한 폼 요소를 찾을 수 없습니다.');
          alert('폼 구성 요소를 찾을 수 없습니다.');
          return;
        }

        titleInput.value = card.title || '';
        descriptionInput.value = card.description || '';
        statusInput.value = card.status || 'todo';
        cardIdInput.value = card.id;
        form.dataset.projectId = projectId;

        const modal = document.getElementById('editCardModal');
        if (!modal) {
          console.error('editCardModal을 찾을 수 없습니다.');
          alert('수정 모달을 찾을 수 없습니다.');
          return;
        }

        const updateCardBtn = document.getElementById('updateCard');
        const newUpdateCardBtn = updateCardBtn.cloneNode(true);
        updateCardBtn.parentNode.replaceChild(newUpdateCardBtn, updateCardBtn);

        newUpdateCardBtn.addEventListener('click', async () => {
          const form = document.getElementById('editCardForm');
          const cardId = document.getElementById('editCardId').value;
          const projectId = form.dataset.projectId || window.currentProjectId;

          console.log('카드 수정 요청:', { cardId, projectId });

          if (!projectId) {
            console.error('프로젝트 ID를 찾을 수 없습니다.');
            alert('프로젝트 ID를 찾을 수 없습니다.');
            return;
          }

          const formData = new FormData(form);
          const data = {
            project_id: projectId,
            card_id: cardId,
            updates: {
              title: formData.get('title'),
              description: formData.get('description'),
              status: formData.get('status')
            }
          };

          try {
            socket.emit('update_card', data);
            bootstrap.Modal.getInstance(document.getElementById('editCardModal')).hide();
            form.reset();
          } catch (err) {
            console.error('Update card error:', err);
            alert('카드 수정 중 오류가 발생했습니다.');
          }
        });

        new bootstrap.Modal(modal).show();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('카드 정보 로드 실패:', errorData);
        alert(errorData.message || '카드 정보를 불러오는 중 오류가 발생했습니다.');
      }
    } catch (err) {
      console.error('카드 정보 로드 중 예외 발생:', err);
      alert('카드 정보를 불러오는 중 오류가 발생했습니다.');
    }
  }

  async function handleDeleteCard(cardId, projectId) {
    if (confirm('이 카드를 삭제하시겠습니까?')) {
      try {
        socket.emit('delete_card', {
          project_id: projectId,
          card_id: cardId
        });
        console.log('카드 삭제 요청 전송:', { cardId, projectId });
      } catch (err) {
        console.error('Delete card error:', err);
        alert('카드 삭제 중 오류가 발생했습니다.');
      }
    }
  }
};