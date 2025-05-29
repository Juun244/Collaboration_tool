let isProjectsInitialized = false;

function initializeProjects() {
  if (isProjectsInitialized) {
    console.log("프로젝트가 이미 초기화되었습니다.");
    return;
  }

  // ✅ 삭제/나가기 버튼 클릭 처리 (모달 내에서 이벤트 바인딩)
  const projectBoardModal = document.getElementById('projectBoardModal');
  if (projectBoardModal) {
    projectBoardModal.addEventListener("click", async e => {
      const target = e.target;
      console.log("Click event in modal, target:", target, "tagName:", target.tagName, "classList:", target.classList.toString()); // 디버깅 로그

      // 버튼 또는 버튼 내 아이콘 클릭 감지
      const button = target.closest("#modalDeleteBtn, #modalLeaveBtn, .delete-project, .leave-project");
      if (!button) {
        console.log("No delete or leave button found for click event");
        return;
      }

      e.stopPropagation();
      const projectId = button.dataset.projectId;
      if (!projectId) {
        alert("프로젝트 ID를 찾을 수 없습니다.");
        console.error("Project ID is missing on button:", button);
        return;
      }

      const isOwner = button.id === "modalDeleteBtn" || button.classList.contains("delete-project");
      const action = isOwner ? "삭제" : "나가기";
      const endpoint = `/projects/${projectId}`;

      console.log(`Attempting to ${action} project with ID: ${projectId}, Endpoint: ${endpoint}`);
      if (confirm(`이 프로젝트를 ${action}하시겠습니까?`)) {
        try {
          const response = await fetch(endpoint, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          });
          console.log(`Response status for ${action}: ${response.status}`); // 디버깅 로그
          if (response.ok) {
            const data = await response.json(); // ✅ 한 번만 json() 호출
            alert(data.message || `프로젝트가 ${action}되었습니다.`);
            window.location.reload();
          } else {
            const error = await response.json().catch(() => ({}));
            console.error(`Failed to ${action} project:`, error);
            alert(error.error || `프로젝트 ${action} 실패`);
          }
        } catch (err) {
          console.error(`Project ${action} error:`, err);
          alert("오류가 발생했습니다. 다시 시도해 주세요.");
        }
      }
    });
  } else {
    console.error("projectBoardModal element not found");
  }

  // 프로젝트 순서 로드
  async function loadProjectOrder() {
    try {
      const response = await fetch("/projects/order", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        const order = data.order;
        const container = document.querySelector(".project-scroll-container");
        if (!container) {
          console.error("Project scroll container not found.");
          return;
        }
        const cards = Array.from(container.querySelectorAll(".project-card-wrapper"));
        order.forEach(projectId => {
          const card = cards.find(c => c.dataset.projectId === projectId);
          if (card) {
            container.appendChild(card);
          }
        });
      } else {
        console.error("Failed to load project order:", response.status);
      }
    } catch (err) {
      console.error("Load project order error:", err);
    }
  }

  loadProjectOrder();

  isProjectsInitialized = true;
  console.log("프로젝트 초기화가 완료되었습니다.");
}



const currentUser = window.currentUser || { id: "", username: "" };

async function loadComments(projectId) {
  if (!projectId) {
    console.error("Project ID is missing for loading comments.");
    return;
  }
  try {
    const res = await fetch(`/projects/${projectId}/comments`, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to load comments: ${res.status}`);
    const data = await res.json();

    const list = document.getElementById("comment-list");
    if (!list) throw new Error("Comment list element not found.");
    list.innerHTML = "";

    data.comments.forEach(comment => {
      const raw = comment.created_at;
      const utcString = raw.includes('Z') ? raw : raw.replace(' ', 'T') + 'Z';
      const dateObj = new Date(utcString);
      const formattedTime = dateObj.toLocaleString('ko-KR', {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      const isMine = comment.author_id === currentUser.id;
      list.innerHTML += `
        <div class="comment mb-2" data-id="${comment._id}">
          <b>${comment.author_name}</b>
          <span style="color:gray; font-size:small;">${formattedTime}</span><br>
          <span class="comment-content">${comment.content}</span>
          ${comment.image_url ? `
            <div class="mt-2">
               <img src="${comment.image_url}" class="img-fluid" style="max-height:200px;" />
            </div>` : ""}
          ${isMine ? `
            <button class="btn btn-sm btn-outline-secondary edit-comment-btn">수정</button>
            <button class="btn btn-sm btn-outline-danger delete-comment-btn">삭제</button>
          ` : ""}
        </div>`;
    });
  } catch (err) {
    console.error("Load comments error:", err);
    alert("댓글을 불러오는 데 실패했습니다.");
  }
}

// ---------------------------------------------------
// ▶ 이벤트 위임: 댓글 리스트에 단 한 번만 붙입니다
// ---------------------------------------------------
document.getElementById('comment-list')?.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const commentDiv = btn.closest('.comment');
  const commentId = commentDiv.dataset.id;
  const projectId = document.getElementById('projectBoardModal').dataset.projectId;

  // 1) 수정 시작
  if (btn.classList.contains('edit-comment-btn')) {
    startInlineEdit(commentDiv);

  // 2) 저장
  } else if (btn.classList.contains('save-comment-btn')) {
    await saveInlineEdit(commentDiv, projectId);

  // 3) 취소
  } else if (btn.classList.contains('cancel-comment-btn')) {
    cancelInlineEdit(commentDiv);

  // 4) 삭제
  } else if (btn.classList.contains('delete-comment-btn')) {
    if (confirm("정말 삭제할까요?")) {
      await deleteComment(commentId, projectId);
    }
  }
});

// ---------------------------------------------------
// ▶ 인라인 편집 헬퍼 함수들
// ---------------------------------------------------
function startInlineEdit(div) {
  if (div.querySelector('textarea')) return;
  const span = div.querySelector('.comment-content');
  const origImg = div.querySelector('img');
  span.style.display = 'none';

  // textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'form-control mb-2';
  textarea.value = span.textContent;
  textarea.rows = 2;
  div.appendChild(textarea);

  // 이미지 업로드 input & 삭제 체크박스
  let fileInput, removeCheckbox, removeLabel;
  if (origImg) {
    origImg.style.display = 'none';
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'form-control form-control-sm mb-2';
    div.appendChild(fileInput);

    removeCheckbox = document.createElement('input');
    removeCheckbox.type = 'checkbox';
    removeCheckbox.id = `rm-img-${div.dataset.id}`;
    removeCheckbox.className = 'form-check-input me-1';
    removeLabel = document.createElement('label');
    removeLabel.htmlFor = removeCheckbox.id;
    removeLabel.textContent = '이미지 삭제';
    removeLabel.className = 'form-check-label mb-2';
    const rmContainer = document.createElement('div');
    rmContainer.className = 'form-check mb-2';
    rmContainer.append(removeCheckbox, removeLabel);
    div.appendChild(rmContainer);
 }

  // 저장/취소 버튼
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-sm btn-primary me-1 save-comment-btn';
  saveBtn.textContent = '저장';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-secondary cancel-comment-btn';
  cancelBtn.textContent = '취소';
  const btnGroup = document.createElement('div');
  btnGroup.className = 'mb-2';
  btnGroup.append(saveBtn, cancelBtn);
  div.appendChild(btnGroup);
}

async function saveInlineEdit(div, projectId) {
  const textarea = div.querySelector('textarea');
  const newText = textarea.value.trim();
  if (!newText) return alert('댓글 내용을 입력하세요.');

  const origImg = div.querySelector('img');
  const fileInput = div.querySelector('input[type=file]');
  const removeCheckbox = div.querySelector('.form-check-input');

  let res;
  if ((fileInput && fileInput.files.length) || (removeCheckbox && removeCheckbox.checked)) {
    const formData = new FormData();
    formData.append('content', newText);
    if (fileInput.files.length) formData.append('image', fileInput.files[0]);
    if (removeCheckbox.checked) formData.append('delete_image', '1');
    res = await fetch(`/comments/${div.dataset.id}`, {
      method: 'PUT',
      body: formData,
      credentials: 'include'
    });
  } else {
    res = await fetch(`/comments/${div.dataset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newText }),
      credentials: 'include'
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return alert(err.error || '수정 실패');
  }

  // UI 업데이트
  div.querySelector('.comment-content').textContent = newText;
  if (origImg) {
    if (removeCheckbox && removeCheckbox.checked) {
      origImg.remove();
    } else if (fileInput && fileInput.files.length) {
      origImg.src = URL.createObjectURL(fileInput.files[0]);
    }
    origImg.style.display = '';
  }
  cancelInlineEdit(div);
}

function cancelInlineEdit(div) {
  div.querySelectorAll(
    'textarea, .form-check, .save-comment-btn, .cancel-comment-btn, input[type=file]'
  ).forEach(el => el.remove());

  // 텍스트 원상 복구
  div.querySelector('.comment-content').style.display = '';

  // 이미지가 있었다면 숨김 해제
  const img = div.querySelector('img');
  if (img) {
    img.style.display = '';
  }
}

async function deleteComment(commentId, projectId) {
  await fetch(`/comments/${commentId}`, { method: 'DELETE', credentials: 'include' });
  loadComments(projectId);
}

// ---------------------------------------------------
// ▶ 초기화
// ---------------------------------------------------
initializeProjects();

// 댓글 + 이미지 업로드 핸들러
const addCommentBtn = document.getElementById('add-comment-btn');
if (addCommentBtn) {
  addCommentBtn.onclick = async function() {
    const contentInput = document.getElementById('new-comment-content');
    const fileInput    = document.getElementById('new-comment-image');
    const content      = contentInput.value.trim();
    const projectId    = document.getElementById('projectBoardModal').dataset.projectId;

    if (!content && !fileInput.files.length) {
      alert("댓글 또는 이미지를 입력하세요.");
      return;
    }
    if (!projectId) {
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }

    const formData = new FormData();
    if (content) formData.append('content', content);
    if (fileInput.files.length) {
      formData.append('image', fileInput.files[0]);
    }

    console.log('FormData image:', formData.get('image')); //test용

    try {
      const res = await fetch(`/projects/${projectId}/comments`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Add comment failed:", err);
        alert(err.error || "댓글 추가 실패");
        return;
      }

      // 초기화 및 재로드
      contentInput.value = '';
      fileInput.value    = '';
      loadComments(projectId);
    } catch (err) {
      console.error("Add comment error:", err);
      alert("댓글 추가 중 오류가 발생했습니다.");
    }
  };
}



// ✅ 모달 열릴 때 프로젝트 정보 로드 및 버튼 설정
const projectBoardModal = document.getElementById('projectBoardModal');
if (projectBoardModal) {
  projectBoardModal.addEventListener('show.bs.modal', async function(event) {
    const projectId = this.dataset.projectId;
    if (!projectId) {
      console.error("Project ID is missing in modal.");
      alert("프로젝트 ID를 찾을 수 없습니다.");
      return;
    }
    console.log(`Modal opened for project ID: ${projectId}`);

    const deleteBtn = document.getElementById('modalDeleteBtn');
    const leaveBtn = document.getElementById('modalLeaveBtn');

    // 버튼 초기화 및 디버깅
    console.log("Delete button:", deleteBtn ? deleteBtn.outerHTML : "Not found");
    console.log("Leave button:", leaveBtn ? leaveBtn.outerHTML : "Not found");
    deleteBtn.classList.add('d-none');
    leaveBtn.classList.add('d-none');
    deleteBtn.dataset.projectId = projectId;
    leaveBtn.dataset.projectId = projectId;

    try {
      console.log(`Fetching project details for ID: ${projectId}`);
      const response = await fetch(`/projects/${projectId}`, { credentials: "include" });
      if (response.ok) {
        const project = await response.json();
        console.log("Project details:", project);
        if (!project.owner_id) {
          console.error("owner_id is missing in project details:", project);
          alert("프로젝트 소유자 정보를 불러올 수 없습니다.");
          leaveBtn.classList.remove('d-none');
          return;
        }
        const isOwner = project.owner_id === currentUser.id;
        console.log(`Current user ID: ${currentUser.id}, Project owner ID: ${project.owner_id}, isOwner: ${isOwner}`);
        
        if (isOwner) {
          deleteBtn.classList.remove('d-none');
          console.log("Showing delete button for owner");
        } else {
          leaveBtn.classList.remove('d-none');
          console.log("Showing leave button for non-owner");
        }
      } else {
        console.error("Failed to load project details:", response.status, await response.text());
        alert("프로젝트 정보를 불러오는 데 실패했습니다.");
      }
    } catch (err) {
      console.error("Load project details error:", err);
      alert("프로젝트 정보를 불러오는 데 오류가 발생했습니다.");
    }

    // 댓글 로드
    loadComments(projectId);
  });
} else {
  console.error("projectBoardModal element not found");
}