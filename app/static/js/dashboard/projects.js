function initializeProjects() {
    // 프로젝트 삭제/나가기
    document.querySelectorAll(".delete-project, .leave-project").forEach(button => {
      button.addEventListener("click", async e => {
        e.stopPropagation();
        const projectId = button.dataset.projectId;
        const isOwner = button.classList.contains("delete-project");
        const action = isOwner ? "삭제" : "나가기";
        if (confirm(`이 프로젝트를 ${action}하시겠습니까?`)) {
          try {
            const response = await fetch(`/projects/${projectId}`, {
              method: "DELETE"
            });
            if (response.ok) {
              alert(`프로젝트가 ${action}되었습니다.`);
              window.location.reload();
            } else {
              const error = await response.json();
              alert(error.message || `프로젝트 ${action} 실패`);
            }
          } catch (err) {
            console.error(`Project ${action} error:`, err);
            alert("오류가 발생했습니다.");
          }
        }
      });
    });
  
    // 프로젝트 순서 로드
    async function loadProjectOrder() {
      try {
        const response = await fetch("/projects/order");
        if (response.ok) {
          const data = await response.json();
          const order = data.order;
          const container = document.querySelector(".project-scroll-container");
          const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
          order.forEach(projectId => {
            const card = cards.find(c => c.dataset.projectId === projectId);
            if (card) {
              container.appendChild(card);
            }
          });
        }
      } catch (err) {
        console.error("Load project order error:", err);
      }
    }
  
    loadProjectOrder();
  }