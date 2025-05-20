// 전역 변수로 초기화 상태 추적
let isMainInitialized = false;

// DOMContentLoaded 이벤트 리스너를 한 번만 실행하도록 수정
const initializeMain = () => {
  if (isMainInitialized) {
    console.log('메인 초기화가 이미 완료되었습니다.');
    return;
  }

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

  isMainInitialized = true;
  console.log('메인 초기화가 완료되었습니다.');
};

// DOMContentLoaded 이벤트 리스너 등록
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMain);
} else {
  initializeMain();
}