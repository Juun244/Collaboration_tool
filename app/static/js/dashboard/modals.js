let isModalInitialized = false;

function initializeModals() {
  if (isModalInitialized) {
    console.log("모달이 이미 초기화되어 있습니다.");
    return;
  }

  console.log("initializeModals 호출됨"); // 디버깅 로그

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
      window.currentProjectId = button.dataset.projectId;
      console.log("카드 생성 모달 열기, projectId:", window.currentProjectId); // 디버깅 로그
      new bootstrap.Modal(document.getElementById("createCardModal")).show();
    });
  });

  // 프로젝트 보드 모달 열기
  document.addEventListener('click', function(e) {
    const card = e.target.closest('.project-card');
    if (!card) return;
    if (e.target.closest(".invite-member, .delete-project, .leave-project, .add-card-btn")) return;

    const wrapper = card.closest(".project-card-wrapper");
    if (!wrapper) return;

    const projectId = wrapper.dataset.projectId;
    const ownerId = wrapper.dataset.ownerId;
    const modal = document.getElementById("projectBoardModal");

    window.currentProjectId = projectId;
    modal.dataset.projectId = projectId;

    // 삭제/나가기 버튼에 projectId 넣기
    const deleteBtn = document.getElementById("modalDeleteBtn");
    const leaveBtn = document.getElementById("modalLeaveBtn");
    if (deleteBtn) deleteBtn.dataset.projectId = projectId;
    if (leaveBtn) leaveBtn.dataset.projectId = projectId;

    // 👇 소유자인지 확인해서 버튼 토글
    const isOwner = ownerId === window.currentUser.id;
    if (deleteBtn) deleteBtn.classList.toggle("d-none", !isOwner);
    if (leaveBtn) leaveBtn.classList.toggle("d-none", isOwner);

    const projectName = card.querySelector(".card-title").textContent;
    document.getElementById("projectBoardTitle").textContent = projectName;

    new bootstrap.Modal(modal).show();
    loadCards();
    loadHistory(projectId);
  });

  isModalInitialized = true;
  console.log("모달 초기화가 완료되었습니다.");
}
