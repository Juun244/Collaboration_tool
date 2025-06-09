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
    const status = addBtn.dataset.status || 'todo';

    const modalElem = document.getElementById("createCardModal");
    const form = modalElem.querySelector('#createCardForm');

    // projectId 숨겨진 input에 값 할당
    form.projectId.value = projectId;

    // status select 기본값 세팅
    form.status.value = status;
    window.currentProjectId = projectId;

    new bootstrap.Modal(modalElem).show();
  });


  // 초대 모달 열기
  document.addEventListener("click", e => {
    const button = e.target.closest(".invite-member");
    if (!button) return;
    
    console.log("초대 모달 클릭 이벤트 발생"); // 디버깅 로그
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
    const isOwner = currentUser.id === wrapper.dataset.ownerId;
    if (isOwner) {
      console.log("모달 열기 - 프로젝트 소유자 확인됨");
      document.getElementById("modalDeleteBtn").classList.remove('d-none');
      document.getElementById("modalLeaveBtn").classList.add('d-none');
    } else {
      console.log("모달 열기 - 프로젝트 소유자 아님");
      document.getElementById("modalDeleteBtn").classList.add('d-none');
      document.getElementById("modalLeaveBtn").classList.remove('d-none');
    }

    // modalDeadline, modalDday 세팅
    const deadlineText = wrapper.dataset.deadline || '';
    const ddayBadge    = wrapper.dataset.dDay || '';

    const dlElem = document.getElementById("modalDeadline");
    const ddElem = document.getElementById("modalDday");

    if (!deadlineText || deadlineText === '없음') {
      // 마감일 없으면
      dlElem.textContent = '없음';
      ddElem.textContent = '';
      ddElem.classList.add('d-none');
    } else {
      dlElem.textContent = deadlineText;
      ddElem.textContent = ddayBadge;
      ddElem.classList.remove('d-none');

      // ddayBadge 값에 맞게 뱃지 색상도 조절하는 기존 코드 재사용
      if (ddayBadge === 'D-Day') {
        ddElem.className = 'badge bg-danger';  // 빨강
      }
      else if (ddayBadge.startsWith('D-')) {
        ddElem.className = 'badge bg-success'; // 초록
      } else if (ddayBadge.startsWith('D+')) {
        ddElem.className = 'badge bg-secondary'; // 회색
      } else {
        ddElem.className = 'badge bg-secondary'; // 기본 회색
      }
    }

    // 모달 띄우기
    const modalElem = document.getElementById("projectBoardModal");
    const bsModal = new bootstrap.Modal(modalElem, { backdrop:'static', keyboard:true });
    bsModal.show();

    // 1) 히스토리 최초 로드
    await loadHistory(window.currentProjectId);

    // 2) 수정 버튼 클릭 시, 임시 date input 생성
    const editBtn = document.getElementById("editDeadlineBtn");
    editBtn.onclick = () => {

      if (editBtn.parentNode.querySelector('input[type="date"]')) return; // 중복생성 방지 

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

        // 빈 문자열이면 '없음' 처리
        if (!newDate) {
          tmp.remove();

          // API 호출해서 deadline을 null로 업데이트
          const res = await fetch(`/projects/${window.currentProjectId}/deadline`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ deadline: null }),
            credentials: 'include'
          });
          const body = await res.json();
          if (!res.ok) {
            return alert(body.error || '업데이트 실패');
          }

          // 마감일 표시를 '없음'으로 변경
          dlElem.textContent = '없음';
          ddElem.textContent = '';
          ddElem.classList.add('d-none');

          // wrapper dataset 반영 (삭제)
          delete wrapper.dataset.deadline;
          delete wrapper.dataset.dDay;

          // 히스토리 리로드 및 섹션 펼치기
          await loadHistory(window.currentProjectId);
          const histList  = document.getElementById("history-list");
          const histArrow = document.getElementById("history-arrow");
          if (!histList.classList.contains("open")) {
            histList.classList.add("open");
            histArrow.classList.replace("bi-caret-right-fill","bi-caret-down-fill");
          }

          alert('마감일이 삭제되었습니다.');
          return;
        }

        // 기존 처리 (날짜가 있을 때)
        tmp.remove();

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

        dlElem.textContent = newDate;

        const today = dateOnly(new Date());
        const deadlineDate = dateOnly(newDate);
        const diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));
        
        if (diff > 0) {
          ddElem.textContent = `D-${diff}`;
          ddElem.classList.add('bg-success');   // 초록(마감되지 않은 날짜)
          ddElem.classList.remove('bg-danger', 'bg-secondary', 'bg-trsparent');
          ddElem.classList.remove('d-none');
        } else if (diff === 0) {
          ddElem.textContent = 'D-Day';
          ddElem.classList.add('bg-danger');    // 빨강(마감 당일)
          ddElem.classList.remove('bg-success', 'bg-secondary', 'bg-trsparent');
          ddElem.classList.remove('d-none');
        } else {
          ddElem.textContent = `D+${Math.abs(diff)}`;
          ddElem.classList.add('bg-secondary'); // 회색(마감된 날짜)
          ddElem.classList.remove('bg-success', 'bg-danger','bg-trsparent');
          ddElem.classList.remove('d-none');
        }
        ddElem.style.fontWeight = 'bold';

        wrapper.dataset.deadline = newDate;
        wrapper.dataset.dDay      = ddElem.textContent;

        await loadHistory(window.currentProjectId);

        alert('마감일이 업데이트되었습니다.');
      };

    }

    // 나머지(카드/댓글 초기화 등)
    loadCards();
    await loadHistory(window.currentProjectId);

  }); 
  

  isModalInitialized = true;
  console.log("모달 초기화가 완료되었습니다.");

};

function dateOnly(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}