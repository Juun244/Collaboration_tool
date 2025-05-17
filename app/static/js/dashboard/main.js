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
  });