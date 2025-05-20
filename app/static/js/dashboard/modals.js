function initializeModals() {
  // 프로젝트 생성
  document.getElementById("createProject").addEventListener("click", async () => {
    const form = document.getElementById("newProjectForm");
    const formData = new FormData(form);
    const data = {
      name: formData.get("name"),
      description: formData.get("description")
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
      console.error("Create project error:", err);
      alert("오류가 발생했습니다.");
    }
  });

  // 초대 보내기
  document.getElementById("sendInvite").addEventListener("click", async () => {
    const form = document.getElementById("inviteMemberForm");
    const formData = new FormData(form);
    const projectId = document.getElementById("inviteProjectId").value;
    const data = {
      username: formData.get("username")
    };
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
    } catch (error) {
      console.error("Error sending invite:", error);
      alert("오류가 발생했습니다.");
    }
  });

  // 초대 모달 열기
  document.querySelectorAll(".invite-member").forEach(button => {
    button.addEventListener("click", e => {
      e.stopPropagation();
      const projectId = button.dataset.projectId;
      document.getElementById("inviteProjectId").value = projectId;
      new bootstrap.Modal(document.getElementById("inviteMemberModal")).show();
    });
  });

  // 카드 생성 모달 열기
  document.querySelectorAll(".add-card-btn").forEach(button => {
    button.addEventListener("click", () => {
      // 이전에 active 상태였던 버튼의 active 클래스 제거
      document.querySelectorAll('.add-card-btn.active').forEach(btn => {
        btn.classList.remove('active');
      });
      
      // 현재 클릭한 버튼에 active 클래스 추가
      button.classList.add('active');
      
      window.currentProjectId = button.dataset.projectId;
      const createCardModal = document.getElementById("createCardModal");
      const statusInput = createCardModal.querySelector("input[name='status']");
      const statusSelectContainer = createCardModal.querySelector(".status-select-container");
      const statusSelect = createCardModal.querySelector("select[name='status']");

      // 프로젝트 보드 모달 내의 버튼인 경우
      if (button.closest('#projectBoardModal')) {
        // 상태 선택 컨테이너 숨기기
        statusSelectContainer.style.display = 'none';
        
        // 버튼이 속한 상태칸의 data-status 값을 가져와서 설정
        const columnStatus = button.closest('.kanban-column').dataset.status;
        console.log("Setting status from column:", columnStatus); // 디버깅용 로그
        
        // hidden input에 상태값 설정
        statusInput.value = columnStatus;
        
        // select에도 상태값 설정 (메인 대시보드에서 사용)
        statusSelect.value = columnStatus;
      } else {
        // 메인 대시보드의 버튼인 경우
        statusSelectContainer.style.display = 'block';
        const status = button.dataset.status || 'To Do'; // 기본값 설정
        statusSelect.value = status;
        statusInput.value = status;
      }

      new bootstrap.Modal(createCardModal).show();
    });
  });

  // 프로젝트 보드 모달 열기
  document.querySelectorAll(".project-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".invite-member, .delete-project, .leave-project, .add-card-btn")) return;
      
      // 프로젝트 ID 설정
      const projectId = card.closest(".project-card-wrapper").dataset.projectId;
      if (!projectId) {
        console.error("프로젝트 ID를 찾을 수 없습니다.");
        return;
      }
      
      // 전역 변수에 프로젝트 ID 설정
      window.currentProjectId = projectId;
      console.log("현재 프로젝트 ID 설정:", window.currentProjectId);
      
      const projectName = card.querySelector(".card-title").textContent;
      document.getElementById("projectBoardTitle").textContent = projectName;
      
      const modal = new bootstrap.Modal(document.getElementById("projectBoardModal"));
      modal.show();
      
      // 모달이 완전히 표시된 후에 카드를 로드
      document.getElementById("projectBoardModal").addEventListener("shown.bs.modal", function onShown() {
        // 모달이 표시된 후 카드 추가 버튼의 프로젝트 ID 설정 확인
        document.querySelectorAll('#projectBoardModal .add-card-btn').forEach(button => {
          if (button.dataset.projectId !== window.currentProjectId) {
            button.dataset.projectId = window.currentProjectId;
          }
        });
        
        loadCards();
        // 이벤트 리스너 제거 (한 번만 실행되도록)
        document.getElementById("projectBoardModal").removeEventListener("shown.bs.modal", onShown);
      }, { once: true });
    });
  });

  // 카드 생성과 수정 이벤트 리스너는 cards.js로 이동
  // createCard와 updateCard 버튼의 이벤트 리스너 제거
  const createCardBtn = document.getElementById("createCard");
  const updateCardBtn = document.getElementById("updateCard");
  if (createCardBtn) {
    const newCreateCardBtn = createCardBtn.cloneNode(true);
    createCardBtn.parentNode.replaceChild(newCreateCardBtn, createCardBtn);
  }
  if (updateCardBtn) {
    const newUpdateCardBtn = updateCardBtn.cloneNode(true);
    updateCardBtn.parentNode.replaceChild(newUpdateCardBtn, updateCardBtn);
  }
}