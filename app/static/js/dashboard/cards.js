async function loadCards() {
    try {
      const response = await fetch("/projects/all/cards");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "카드 로드 실패");
      }
      const data = await response.json();
      const cards = data.cards;
  
      document.querySelectorAll(".card-container").forEach(container => {
        container.innerHTML = "";
      });
  
      cards.forEach(card => {
        const container = document.querySelector(`.card-container[data-project-id="${card.project_id}"]`);
        if (container) {
          const cardElement = document.createElement("div");
          cardElement.className = "task-card";
          cardElement.dataset.cardId = card.id;
          cardElement.dataset.projectId = card.project_id;
          cardElement.draggable = true;
          cardElement.innerHTML = `
            <div class="card-header">
              <h6 class="card-title">${card.title}</h6>
              <div>
                <button class="edit-card-btn" data-card-id="${card.id}"><i class="bi bi-pencil"></i></button>
                <button class="delete-card-btn" data-card-id="${card.id}"><i class="bi bi-trash"></i></button>
              </div>
            </div>
            <p class="card-description">${card.description}</p>
          `;
          container.appendChild(cardElement);
  
          cardElement.addEventListener("dragstart", handleCardDragStart);
          cardElement.addEventListener("dragend", handleCardDragEnd);
        }
      });
  
      // 카드 수정 버튼 이벤트
      document.querySelectorAll(".edit-card-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
          e.stopPropagation();

          const cardId = button.dataset.cardId;
          const response = await fetch(`/projects/${window.currentProjectId}/cards`);
          if (response.ok) {
            const data = await response.json();
            const card = data.cards.find(c => c.id === cardId);
            if (card) {
              const form = document.getElementById("editCardForm");
              form.querySelector("[name='title']").value = card.title;
              form.querySelector("[name='description']").value = card.description;
              document.getElementById("editCardId").value = cardId;
              new bootstrap.Modal(document.getElementById("editCardModal")).show();
            }
          }
        });
      });
  
      // 카드 삭제 버튼 이벤트
      document.querySelectorAll(".delete-card-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
          e.stopPropagation();

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
    } catch (err) {
      console.error("Load cards error:", err);
      alert("카드 로드 중 오류가 발생했습니다.");
    }
  }
  
  function initializeCards() {
    loadCards();
  }

