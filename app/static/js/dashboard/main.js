document.addEventListener("DOMContentLoaded", () => {
  // 전역 변수
  window.currentProjectId = null;
  window.selectedProjectId = null;

  // 사이드바 요소
  const sidebar = document.getElementById("sidebarMenu");
  const toggleButton = document.getElementById("menuToggle");
  const closeButton = document.getElementById("menuClose");

  // 사이드바 토글
  function toggleSidebar() {
    sidebar.classList.toggle("sidebar-closed");
    sidebar.classList.toggle("sidebar-open");
    toggleButton.style.display = sidebar.classList.contains("sidebar-open") ? "none" : "block";
    closeButton.style.display = sidebar.classList.contains("sidebar-open") ? "block" : "none";
  }

  toggleButton.addEventListener("click", toggleSidebar);
  closeButton.addEventListener("click", toggleSidebar);

  // 모듈 초기화
  initializeDragAndDrop();
  initializeModals();
  initializeCards();
  initializeProjects();
  initializeInvitations();

  // ✅ 채팅 버튼 클릭 시 chatModal 열고 projectId 설정
  document.querySelectorAll(".open-chat-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // 상세페이지 모달 열리는 버블링 방지
      e.preventDefault();  // 링크 이동 방지

      const projectId = btn.dataset.projectId;
      window.currentProjectId = projectId;

      const modal = document.getElementById("chatModal");
      modal.dataset.projectId = projectId;

      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();

      console.log("💬 채팅방 입장:", projectId);
    });
  });
});

// 프로젝트 카드 클릭 시 projectBoardModal에 projectId 설정
document.querySelectorAll(".project-card-wrapper").forEach(wrapper => {
  wrapper.addEventListener("click", (e) => {
    const projectId = wrapper.dataset.projectId;
    window.currentProjectId = projectId;

    const modal = document.getElementById("projectBoardModal");
    modal.dataset.projectId = projectId;

    const projectName = wrapper.querySelector(".card-title")?.textContent || "프로젝트 보드";
    document.getElementById("projectBoardTitle").textContent = projectName;
  });
});

