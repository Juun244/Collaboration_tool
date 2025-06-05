let isModalInitialized = false;

function initializeModals() {
  if (isModalInitialized) {
    console.log("모달이 이미 초기화되어 있습니다.");
    return;
  }

  console.log("initializeModals 호출됨"); // 디버깅 로그

  // 카드 추가 버튼 클릭 이벤트 위임
  document.addEventListener('click', e => {
    const addBtn = e.target.closest('.add-card-btn');
    if (!addBtn) return;

    e.stopPropagation();
    const projectId = addBtn.dataset.projectId;
    const status = addBtn.dataset.status;

    const modalElem = document.getElementById("createCardModal");
    const form = modalElem.querySelector('#createCardForm');

    // projectId 숨겨진 input에 값 할당
    form.projectId.value = projectId;

    // status select 기본값 세팅
    form.status.value = status;

    new bootstrap.Modal(modalElem).show();
  });


  // 초대 모달 열기
  document.addEventListener("click", e => {
    const button = e.target.closest(".invite-member");
    if (!button) return;

    e.stopPropagation(); // 카드 클릭 이벤트 방지
    const projectId = button.dataset.projectId;
    const inputElem = document.getElementById("inviteProjectId");

    if (!projectId || !inputElem) return;

    inputElem.value = projectId;
    new bootstrap.Modal(document.getElementById("inviteMemberModal")).show();
  });

  // 프로젝트 보드 모달 열기
  document.addEventListener('click', async function(e) {
    const card = e.target.closest('.project-card');
    if (!card ||
        e.target.closest(".invite-member, .open-chat-btn, .add-card-btn")
    ) return;

    // wrapper, projectId, modal title/데이터 세팅
    const wrapper = card.closest('.project-card-wrapper');
    window.currentProjectId = wrapper.dataset.projectId;
    document.getElementById("projectBoardModal").dataset.projectId = window.currentProjectId;
    document.getElementById("projectBoardTitle").textContent = card.querySelector(".card-title").textContent;
    document.getElementById("modalDeleteBtn").dataset.projectId = window.currentProjectId;
    document.getElementById("modalLeaveBtn").dataset.projectId  = window.currentProjectId;

    // modalDeadline, modalDday 세팅
    const deadlineText = wrapper.dataset.deadline || '';
    const ddayBadge    = wrapper.dataset.dDay       || '';
    const dlElem = document.getElementById("modalDeadline");
    const ddElem = document.getElementById("modalDday");
    dlElem.textContent = deadlineText;
    ddElem.textContent = ddayBadge;

    // 모달 띄우기
    const modalElem = document.getElementById("projectBoardModal");
    const bsModal = new bootstrap.Modal(modalElem, { backdrop:'static', keyboard:true });
    bsModal.show();

    // 1) 히스토리 최초 로드
    await loadHistory(window.currentProjectId);

    // 2) 수정 버튼 클릭 시, 임시 date input 생성
    const editBtn = document.getElementById("editDeadlineBtn");
    editBtn.onclick = () => {
      // input 요소 만들고 버튼 옆에 붙이기
      const tmp = document.createElement('input');
      tmp.type  = 'date';
      tmp.value = wrapper.dataset.deadline || '';
      tmp.style.marginLeft = '0.5rem';
      editBtn.parentNode.insertBefore(tmp, editBtn.nextSibling);

      // 포커스 & 달력 열기
      tmp.focus();
      if (typeof tmp.showPicker === 'function') tmp.showPicker();

      // 날짜 선택 즉시 처리
      tmp.onchange = async () => {
        const newDate = tmp.value;
        tmp.remove();

        // API 호출
        const res = await fetch(`/projects/${window.currentProjectId}/deadline`, {
          method: 'PUT',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ deadline: newDate }),
          credentials: 'include'
        });
        const body = await res.json();
        if (!res.ok) {
          return alert(body.error || '업데이트 실패');
        }

        // 모달 텍스트 갱신
        dlElem.textContent = newDate;
        const diff = Math.floor((new Date(newDate) - new Date())/(1000*60*60*24));
        ddElem.textContent = diff>0 ? `D-${diff}` : diff===0 ? 'D-Day' : `D+${Math.abs(diff)}`;

        // wrapper dataset 반영
        wrapper.dataset.deadline = newDate;
        wrapper.dataset.dDay      = ddElem.textContent;

        // 3) 즉시 히스토리 리로드
        await loadHistory(window.currentProjectId);

        // 히스토리 섹션 펼치기
        const histList  = document.getElementById("history-list");
        const histArrow = document.getElementById("history-arrow");
        if (!histList.classList.contains("open")) {
          histList.classList.add("open");
          histArrow.classList.replace("bi-caret-right-fill","bi-caret-down-fill");
        }

        alert('마감일이 업데이트되었습니다.');
      };
    };

    // 나머지(카드/댓글 초기화 등)
    loadCards();
    await loadHistory(window.currentProjectId);

  }); 

  isModalInitialized = true;
  console.log("모달 초기화가 완료되었습니다.");

};