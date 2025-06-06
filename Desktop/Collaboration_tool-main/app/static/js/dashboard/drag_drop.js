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

function initializeDragAndDrop() {
  const container = document.querySelector(".project-scroll-container");
  const kanbanBoard = document.querySelector(".kanban-board");

  // 마우스 휠로 가로 스크롤
  container.addEventListener("wheel", e => {
    if (!isDragging) {
      e.preventDefault();
      container.scrollLeft += e.deltaY * 0.5;
    }
  });

  kanbanBoard.addEventListener("wheel", e => {
    if (!isDragging) {
      e.preventDefault();
      kanbanBoard.scrollLeft += e.deltaY * 0.5;
    }
  });

  // 프로젝트 드래그 설정
  // 프로젝트 카드 드래그 앤 드롭 관련 변수
  let isDragging = false;
  let dragged = null;
  let dragClone = null;
  let dragTimer = null;
  let scrollAnimationFrame = null;
  let startX = 0;
  let startY = 0;
  let wasDragging = false;

  // 이벤트 위임으로 드래그 시작 처리
  container.addEventListener('mousedown', e => {
    const cardWrapper = e.target.closest('.project-card-wrapper');
    if (!cardWrapper) return;

    // task-card 내부 클릭 시 드래그 방지
    if (e.target.closest('.task-card')) return;

    e.preventDefault();
    e.stopPropagation();

    startX = e.clientX;
    startY = e.clientY;

    dragTimer = setTimeout(() => {
      startProjectDrag(cardWrapper, e.clientX, e.clientY);
    }, 200);
  });

  container.addEventListener('mousemove', e => {
    if (isDragging && dragged) {
      e.preventDefault();
      handleProjectDrag(e.clientX, e.clientY);
    }
  });

  container.addEventListener('mouseup', e => {
    clearTimeout(dragTimer);
    if (isDragging) {
      endProjectDrag();
    }
  });

  container.addEventListener('mouseleave', e => {
    clearTimeout(dragTimer);
  });

  container.addEventListener('touchstart', e => {
    const cardWrapper = e.target.closest('.project-card-wrapper');
    if (!cardWrapper) return;
    if (e.target.closest('.task-card')) return;

    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;

    dragTimer = setTimeout(() => {
      startProjectDrag(cardWrapper, touch.clientX, touch.clientY);
    }, 300);
  });

  container.addEventListener('touchmove', e => {
    if (isDragging && dragged) {
      e.preventDefault();
      const touch = e.touches[0];
      handleProjectDrag(touch.clientX, touch.clientY);
    }
  });

  container.addEventListener('touchend', e => {
    clearTimeout(dragTimer);
    if (isDragging) {
      endProjectDrag();
    }
  });
  // 드래그 관련 함수들
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

    if (scrollAnimationFrame) {
      cancelAnimationFrame(scrollAnimationFrame);
    }

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

      if (isDragging) {
        scrollAnimationFrame = requestAnimationFrame(scrollStep);
      }
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

    setTimeout(() => {
      wasDragging = false;
    }, 100);
  }

  async function saveProjectOrder() {
    const order = Array.from(container.querySelectorAll(".project-card-wrapper"))
      .map(card => card.getAttribute("data-project-id"));

    localStorage.setItem("projectOrder", JSON.stringify(order)); // 선택사항

    try {
      const response = await fetch("/projects/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order })
      });
      if (!response.ok) {
        console.error("프로젝트 순서 저장 실패:", response.status);
      }
    } catch (err) {
      console.error("순서 저장 중 오류:", err);
    }
  }

  // 카드 드래그 앤 드롭 설정
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
    if (container) {
      container.classList.remove('drag-over');
    }
  }

  async function handleCardDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const container = e.target.closest('.card-container');
    if (!container || !draggedCard) {
      console.error('Drop failed: container or draggedCard is null');
      if (draggedCard) {
        draggedCard.style.display = 'block';
      }
      if (placeholder) {
        placeholder.remove();
        placeholder = null;
      }
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

    console.log(`Dropping card ${cardId} to project ${targetProjectId}`);
    await updateCardProjectAndOrder(cardId, targetProjectId, container);
  }

  async function updateCardProjectAndOrder(cardId, targetProjectId, container) {
    const cards = [...container.querySelectorAll('.task-card')];
    const order = cards.map(card => card.dataset.cardId);
    console.log(`Updating card ${cardId} to project ${targetProjectId} with order:`, order);

    try {
      // sourceProjectId 검증
      const sourceProjectId = draggedCard?.dataset.projectId;
      if (!sourceProjectId) {
        console.error('draggedCard:', draggedCard);
        console.error('draggedCard.dataset:', draggedCard?.dataset);
        throw new Error('Source project ID not found in draggedCard. Ensure task-card has data-project-id.');
      }
      if (!cardId) {
        throw new Error('Card ID is missing');
      }
      if (!targetProjectId) {
        throw new Error('Target project ID is missing');
      }

      console.log(`Moving card ${cardId} from ${sourceProjectId} to ${targetProjectId}`);
      const payload = {
        cardId,
        projectId: targetProjectId,
        sourceProjectId,
        order
      };
      console.log('Request payload:', payload);
      const response = await fetch(`/projects/${sourceProjectId}/cards/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      socket.emit('card_moved', {
        card_id: cardId,
        source_project_id: sourceProjectId,
        target_project_id: targetProjectId,
        order
      });

      let errorData = null;
      try {
        errorData = await response.json();
      } catch (e) {
        console.error('Failed to parse response as JSON:', await response.text());
        errorData = { message: '서버 응답을 파싱할 수 없습니다.' };
      }

      if (!response.ok) {
        console.error(`카드 이동/순서 업데이트 실패: ${errorData.message}`, errorData);
        alert(errorData.message || '카드 이동/순서 업데이트에 실패했습니다.');
        return;
      }

      console.log(`Card ${cardId} successfully moved from ${sourceProjectId} to ${targetProjectId}`);
      // draggedCard의 projectId 갱신
      if (draggedCard) {
        draggedCard.dataset.projectId = targetProjectId;
      }
      // 양쪽 프로젝트의 히스토리 갱신
      await loadHistory(sourceProjectId);
      await loadHistory(targetProjectId);
      loadCards();
    } catch (error) {
      console.error('Error updating card:', error.message);
      alert('카드 이동/순서 업데이트 중 오류가 발생했습니다: ' + error.message);
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
  setTimeout(() => {
    draggedCard.style.display = 'none';
  }, 0);
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

socket.on("card_moved", data => {
  console.log("Card moved event received:", data);
  const { source_project_id, target_project_id } = data;
  const currentProjectIds = getVisibleProjectIds(); // 화면에 보이는 프로젝트 목록

  if (currentProjectIds.includes(source_project_id)) {
    loadCards(source_project_id);
  }
  if (currentProjectIds.includes(target_project_id)) {
    loadCards(target_project_id);
  }
});

function getVisibleProjectIds() {
  return Array.from(document.querySelectorAll(".card-container"))
    .map(el => el.dataset.projectId);
}