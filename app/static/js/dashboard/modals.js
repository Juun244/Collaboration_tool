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

  // 카드 생성
  document.getElementById("createCard").addEventListener("click", async () => {
    const form = document.getElementById("createCardForm");
    const formData = new FormData(form);
    const projectId = window.currentProjectId; // main.js에서 정의된 전역 변수
    const data = {
      title: formData.get("title"),
      description: formData.get("description")
    };
    try {
      const response = await fetch(`/projects/${projectId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        alert("카드가 생성되었습니다!");
        bootstrap.Modal.getInstance(document.getElementById("createCardModal")).hide();
        form.reset();
        loadCards(); // cards.js에서 정의된 함수
      } else {
        const error = await response.json();
        alert(error.message || "카드 생성 실패");
      }
    } catch (err) {
      console.error("Create card error:", err);
      alert("오류가 발생했습니다.");
    }
  });

  // 카드 수정
  document.getElementById("updateCard").addEventListener("click", async () => {
    const form = document.getElementById("editCardForm");
    const formData = new FormData(form);
    const cardId = document.getElementById("editCardId").value;
    const projectId = window.currentProjectId;
    const data = {
      title: formData.get("title"),
      description: formData.get("description")
    };
    try {
      const response = await fetch(`/projects/${projectId}/cards/${cardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        alert("카드가 수정되었습니다!");
        bootstrap.Modal.getInstance(document.getElementById("editCardModal")).hide();
        form.reset();
        loadCards();
      } else {
        const error = await response.json();
        alert(error.message || "카드 수정 실패");
      }
    } catch (err) {
      console.error("Update card error:", err);
      alert("오류가 발생했습니다.");
    }
  });

  // 카드 생성 모달 열기
  document.querySelectorAll(".add-card-btn").forEach(button => {
    button.addEventListener("click", () => {
      window.currentProjectId = button.dataset.projectId;
      new bootstrap.Modal(document.getElementById("createCardModal")).show();
    });
  });

 document.addEventListener('click', function(e) {
    // 클릭된 요소 또는 조상 중에 .project-card가 있으면 잡기
    const card = e.target.closest('.project-card');
    if (!card) return; // .project-card 클릭이 아니면 무시

    // .invite-member, .delete-project 등 관리 버튼 눌렀을 때는 동작하지 않음
    if (e.target.closest(".invite-member, .delete-project, .leave-project, .add-card-btn")) return;

    // project-card-wrapper에서 프로젝트 ID 추출
    const wrapper = card.closest(".project-card-wrapper");
    if (!wrapper) return; // 혹시나 wrapper 없으면 중단

    window.currentProjectId = wrapper.dataset.projectId;
    if (!window.currentProjectId) {
      console.error("Project ID not found on project-card-wrapper", card);
      return; // 프로젝트 ID 없으면 모달 열지 않음
    }

    // 모달에 현재 프로젝트 ID 넣기 (댓글 등 기능 정상 작동 위해)
    document.getElementById("projectBoardModal").dataset.projectId = window.currentProjectId;

    // 모달 상단에 프로젝트 이름 띄우기
    const projectName = card.querySelector(".card-title").textContent;
    document.getElementById("projectBoardTitle").textContent = projectName;

    // 모달 실제로 띄우기
    new bootstrap.Modal(document.getElementById("projectBoardModal")).show();

    // 카드 및 히스토리 불러오기
    loadCards();
    loadHistory(window.currentProjectId)
  });
  
}