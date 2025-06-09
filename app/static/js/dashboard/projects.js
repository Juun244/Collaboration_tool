let isProjectsInitialized = false;

function initializeProjects() {
  if (isProjectsInitialized) {
    console.log("프로젝트가 이미 초기화되었습니다.");
    return;
  }

  socket.on("project_updated", (data) => {
    console.log("프로젝트 업데이트 이벤트 수신:", data);
    const cardEl = document.querySelector(`.project-card-wrapper[data-project-id="${data.project_id}"]`);

    if (data.action === "나가기") {
      if (!cardEl) return;
      const countEl = cardEl.querySelector(".member-count");
      if (!countEl) return;
      const current = parseInt(countEl.textContent) || 0;
      countEl.textContent = `${current - 1} members`;
      console.log("멤버 수 갱신:", countEl.textContent);
      if (data.user_nickname != window.currentUserNickname)  alert(`👋 ${data.user_nickname}님이 프로젝트를 나갔습니다.`, "info");
    } else if (data.action === "삭제") {
      cardEl.remove();
      if (data.user_nickname != window.currentUserNickname)  alert(`📌 ${data.user_nickname}님이 프로젝트를 삭제했습니다.`, "info");
    }
  });

  // 마감일 설정/수정 이벤트 수신
  socket.on("set_due_date", updateCardDueDate);
  socket.on("update_due_date", updateCardDueDate);

  function updateCardDueDate(data) {
    const card = document.querySelector(`.project-card-wrapper[data-project-id="${data.project_id}"]`);
    if (card) {
      const due = card.querySelector(".due-date");
      if (due) {
        due.textContent = formatDate(data.due_date);
      }
    }
  }

  // 댓글 관련 이벤트 수신
  socket.on("create_comment", data => {
    const currentProjectId = document.getElementById("projectBoardModal")?.dataset.projectId;
    if (data.project_id !== currentProjectId) return;

    const list = document.getElementById("comment-list");
    if (list) {
      const commentHTML = renderCommentHTML(data.comment);
      list.insertAdjacentHTML("beforeend", commentHTML);
    }
  });

  socket.on("update_comment", data => {
    const div = document.querySelector(`.comment[data-id="${data.comment.id}"]`);
    if (!div) return;

    const contentSpan = div.querySelector(".comment-content");
    if (contentSpan) contentSpan.textContent = data.comment.content;

    let img = div.querySelector("img");
    if (data.comment.image_url) {
      if (!img) {
        img = document.createElement("img");
        img.className = "img-fluid";
        div.appendChild(img);
      }
      img.src = data.comment.image_url;
      img.style.maxHeight = "200px";
    } else {
      if (img) img.remove();
    }
  });

  socket.on("delete_comment", data => {
    const div = document.querySelector(`.comment[data-id="${data.comment_id}"]`);
    if (div) div.remove();
  });

  // ✅ 삭제/나가기 버튼 클릭 처리 (모달 내에서 이벤트 바인딩)
  const projectBoardModal = document.getElementById('projectBoardModal');
  if (projectBoardModal) {
    projectBoardModal.addEventListener("click", async e => {
      const target = e.target;

      // 버튼 또는 버튼 내 아이콘 클릭 감지
      const button = target.closest("#modalDeleteBtn, #modalLeaveBtn");
      if (!button) {
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
          await socket.emit('project_updated', { project_id: projectId , action: action});
          const response = await fetch(endpoint, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json(); // ✅ 한 번만 json() 호출
            alert(data.message || `프로젝트가 ${action}되었습니다.`);

            // ✅ 1. 모달 닫기
            const bsModal = bootstrap.Modal.getInstance(projectBoardModal);
            bsModal.hide();

            // ✅ 2. 프로젝트 카드 제거 (애니메이션 포함)
            const wrapper = document.querySelector(`.project-card-wrapper[data-project-id="${projectId}"]`);
            if (wrapper) {
              wrapper.classList.add("fade-out");
              setTimeout(() => wrapper.remove(), 300);
            }

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
          // 이벤트 수신을 위한 각 project의 room에 join
          socket.emit('join', projectId);
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

const currentUser = window.currentUser || { id: "", nickname: "" };

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
      // 댓글 ID를 문자열로 저장
      const commentId = comment.id || comment._id;
      
      list.innerHTML += `

        <div class="comment mb-2" data-id="${comment.id}">
          <b>${comment.author_name}</b>
          <span style="color:gray; font-size:small;">${formattedTime}</span><br>
          <span class="comment-content">${comment.content}</span>
          ${comment.image_url ? `
            <div class="mt-2">
               <img src="${comment.image_url}" class="img-fluid" style="max-height:200px;" />
            </div>` : ""}
          ${isMine ? `
            <div class="mt-1">
              <button class="btn btn-sm btn-outline-secondary edit-comment-btn" data-comment-id="${commentId}">수정</button>
              <button class="btn btn-sm btn-outline-danger delete-comment-btn" data-comment-id="${commentId}">삭제</button>
            </div>
          ` : ""}
        </div>`;
    });
  } catch (err) {
    console.error("Load comments error:", err);
    alert("댓글을 불러오는 데 실패했습니다.");
  }
}

// 프로젝트 생성
document.getElementById("createProject").addEventListener("click", async () => {
    const form = document.getElementById("newProjectForm");
    const formData = new FormData(form);
    const data = {
      name: formData.get("name"),
      description: formData.get("description"),
      deadline: formData.get("deadline")
    };
    try {
      const response = await fetch("/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        const project = await response.json();
        appendProjectCard(project);
        alert("프로젝트가 생성되었습니다!");

        // 🔧 모달 닫기 안전 처리
        const modalElement = document.getElementById("newProjectModal");
        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
        modalInstance.hide();
        form.reset();
      } else {
        const error = await response.json();
        alert(error.message || "프로젝트 생성 실패");
      }
    } catch (err) {
      console.error("Create project error:", err);
      alert("오류가 발생했습니다.");
    }
  });

// ---------------------------------------------------
// ▶ 이벤트 위임: 댓글 리스트에 단 한 번만 붙입니다
// ---------------------------------------------------
document.getElementById('comment-list')?.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  
  const commentDiv = btn.closest('.comment');
  if (!commentDiv) {
    console.error('Comment div not found');
    return;
  }

  const commentId = commentDiv.dataset.id;
  if (!commentId) {
    console.error('Comment ID not found in comment div');
    return;
  }

  const projectId = document.getElementById('projectBoardModal')?.dataset.projectId;
  if (!projectId) {
    console.error('Project ID not found');
    return;
  }

  console.log('Comment action:', { 
    action: btn.classList.contains('edit-comment-btn') ? 'edit' : 
            btn.classList.contains('save-comment-btn') ? 'save' :
            btn.classList.contains('delete-comment-btn') ? 'delete' : 'unknown',
    commentId,
    projectId
  });

  // 1) 수정 시작
  if (btn.classList.contains('edit-comment-btn')) {
    startInlineEdit(commentDiv);

  // 2) 저장
  } else if (btn.classList.contains('save-comment-btn')) {
    console.log('Save button clicked for comment:', commentId);
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
  let fileInput, removeBtn;
  if (origImg) {
    // 삭제(X) 버튼 생성
    removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'X';
    removeBtn.title = '이미지 삭제';
    removeBtn.className = 'btn btn-sm btn-danger ms-2 remove-img-btn';
    origImg.after(removeBtn);
    // 파일 input(기본 숨김)
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'form-control form-control-sm mt-2 d-none';
    div.appendChild(fileInput);

    // X버튼 클릭시: 이미지+X 버튼 제거, 파일input 노출
    removeBtn.onclick = () => {
      origImg.remove();
      removeBtn.remove();
      fileInput.classList.remove('d-none');
    };
  } else {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'form-control form-control-sm mt-2';
    div.appendChild(fileInput);
  }

  // 저장/취소 버튼
  const btnGroup = document.createElement('div');
  btnGroup.className = 'mt-2';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-sm btn-primary me-1 save-comment-btn';
  saveBtn.textContent = '저장';
  saveBtn.type = 'button';  // 명시적으로 type 지정
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-secondary cancel-comment-btn';
  cancelBtn.textContent = '취소';
  cancelBtn.type = 'button';  // 명시적으로 type 지정
  
  btnGroup.append(saveBtn, cancelBtn);
  div.appendChild(btnGroup);

  // textarea에 포커스
  textarea.focus();
}

async function saveInlineEdit(div, projectId) {
  const commentId = div.dataset.id;
  
  if (!commentId) {
    console.error('Comment ID is missing');
    alert('댓글 ID를 찾을 수 없습니다.');
    return;
  }

  const textarea = div.querySelector('textarea');
  if (!textarea) {
    console.error('Textarea not found');
    return;
  }

  const newText = textarea.value.trim();
  
  const fileInput = div.querySelector('input[type=file]');
  const hasImage = fileInput && fileInput.files.length > 0;
  // "이미지"가 없는 상태: (X버튼 눌려서 <img>없고, 파일input 보임)
  const isImageRemoved = !div.querySelector('img') && fileInput && !fileInput.classList.contains('d-none');
  if (!newText && !hasImage && !isImageRemoved) {
    return alert('댓글 내용을 입력하거나 이미지를 추가/삭제하세요.');
  }
  let res;
  if (hasImage || isImageRemoved) {
    const formData = new FormData();
    formData.append('content', newText);
    if (hasImage) formData.append('image', fileInput.files[0]);
    if (isImageRemoved) formData.append('delete_image', '1');
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

    // UI 업데이트
    const contentSpan = div.querySelector('.comment-content');
    if (contentSpan) {
      contentSpan.textContent = newText;
      contentSpan.style.display = '';
    }

  // UI 업데이트
  loadComments(projectId);
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
  
  if (!commentId) {
    console.error('Comment ID is missing');
    alert('댓글 ID를 찾을 수 없습니다.');
    return;
  }

  try {
    const res = await fetch(`/comments/${commentId}`, { 
      method: 'DELETE', 
      credentials: 'include' 
    });
    
    const responseData = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      throw new Error(responseData.message || '댓글 삭제 실패');
    }

    // 소켓 이벤트 발생
    socket.emit('delete_comment', {
      project_id: projectId,
      comment_id: commentId
    });

    // UI에서 댓글 제거
    const commentDiv = document.querySelector(`.comment[data-id="${commentId}"]`);
    if (commentDiv) {
      commentDiv.remove();
    } else {
      console.warn('Comment element not found in DOM:', commentId);
    }
  } catch (err) {
    console.error('Delete comment error:', err);
    alert(err.message || '댓글 삭제 중 오류가 발생했습니다.');
  }
}

// ---------------------------------------------------
// ▶ 초기화
// ---------------------------------------------------
initializeProjects();

// 댓글 + 이미지 업로드 핸들러
document.getElementById('projectBoardModal')
  .addEventListener('click', async function (e) {
    const addCommentBtn = e.target.closest('#add-comment-btn');
    if (!addCommentBtn) return;

    console.log("모달 내 댓글 추가 버튼 클릭됨");

    const contentInput = document.getElementById('new-comment-content');
    const fileInput = document.getElementById('new-comment-image');
    const content = contentInput.value.trim();
    const projectId = document.getElementById('projectBoardModal')?.dataset?.projectId;

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

    try {
      const res = await fetch(`/projects/${projectId}/comments`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "댓글 추가 실패");
        return;
      }

      const responseData = await res.json();

      // socket emit 등 생략
      contentInput.value = '';
      fileInput.value = '';
      loadComments(projectId);
    } catch (err) {
      console.error("댓글 추가 중 오류:", err);
      alert("댓글 추가 중 오류가 발생했습니다.");
    }
  });




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
}

function appendProjectCard(project) {
  const container = document.querySelector('.project-scroll-container');
  if (!container) return console.error('Project container not found');

  const wrapper = document.createElement('div');
  wrapper.className = 'project-card-wrapper';
  wrapper.dataset.projectId = project.id;
  wrapper.dataset.ownerId = project.owner.$oid || project.owner;;

  // 마감일 세팅
  if (project.deadline) {
    const deadlineDate = new Date(project.deadline);
    if (!isNaN(deadlineDate.getTime())) {
      const deadlineStr = deadlineDate.toISOString().slice(0, 10);
      wrapper.dataset.deadline = deadlineStr;
    } else {
      wrapper.dataset.deadline = '';
    }
  } else {
    wrapper.dataset.deadline = '';
  }

  // dDay 계산 및 세팅
  const today = dateOnly(new Date());
  const deadlineDate = wrapper.dataset.deadline ? dateOnly(wrapper.dataset.deadline) : null;

  let diff;
  if (deadlineDate) {
    diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));
  } else {
    diff = null;
  }

  if (diff === null) {
    wrapper.dataset.dDay = '';
  } else if (diff > 0) {
    wrapper.dataset.dDay = `D-${diff}`;
  } else if (diff === 0) {
    wrapper.dataset.dDay = 'D-Day';
  } else {
    wrapper.dataset.dDay = `D+${Math.abs(diff)}`;
  }

  console.log(`Deadline: ${wrapper.dataset.deadline}, dDay: ${wrapper.dataset.dDay}`);
  
  // 카드 내부 구성
  wrapper.innerHTML = `
    <div class="card project-card h-100 position-relative">
      <div class="card-body">
        <h5 class="card-title">${project.name}</h5>
        <p class="card-text truncate-description">${project.description || ''}</p>

        <div class="card-container mt-3" data-project-id="${project.id}"></div>
        <span class="member-count" data-members="${project.members?.length || 0}">
          ${project.members?.length || 0} members
        </span>
        <button class="btn add-card-btn mt-2 w-100"
                data-project-id="${project.id}">
          <span class="add-card-content"><i class="bi bi-plus-lg"></i> 카드 추가</span>
        </button>
      </div>

      <button class="btn btn-sm btn-outline-primary invite-member position-absolute start-0 bottom-0 m-2"
              data-project-id="${project.id}">
        <i class="bi bi-person-plus"></i> Invite
      </button>

      <button class="btn btn-sm btn-outline-success open-chat-btn position-absolute end-0 bottom-0 m-2"
              data-project-id="${project.id}"
              data-project-name="${project.name}">
        <i class="bi bi-chat-dots"></i> Chat
      </button>
    </div>
  `;
  container.appendChild(wrapper); // 맨 끝에 추가

  // 스크롤 위치를 새로 추가된 프로젝트까지 이동
  wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function renderCommentHTML(comment) {
  const isMine = comment.author_id === currentUser.id;
  const time = new Date(comment.created_at).toLocaleString('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  return `
    <div class="comment mb-2" data-id="${comment.id}">
      <b>${comment.author_name}</b>
      <span style="color:gray; font-size:small;">${time}</span><br>
      <span class="comment-content">${comment.content}</span>
      ${comment.image_url ? `<div class="mt-2"><img src="${comment.image_url}" class="img-fluid" style="max-height:200px;" /></div>` : ""}
      ${isMine ? `
        <div class="mt-1">
          <button class="btn btn-sm btn-outline-secondary edit-comment-btn">수정</button>
          <button class="btn btn-sm btn-outline-danger delete-comment-btn">삭제</button>
        </div>
      ` : ""}
    </div>
  `;
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('ko-KR', { dateStyle: 'medium' });
}

// 소켓 이벤트 리스너 추가
socket.on('comment_deleted', data => {
  const div = document.querySelector(`.comment[data-id="${data.comment_id}"]`);
  if (div) div.remove();
});

socket.on('comment_updated', data => {
  const div = document.querySelector(`.comment[data-id="${data.comment_id}"]`);
  if (!div) return;

  const contentSpan = div.querySelector('.comment-content');
  if (contentSpan) contentSpan.textContent = data.content;

  let img = div.querySelector('img');
  if (data.image_url) {
    if (!img) {
      img = document.createElement('img');
      img.className = 'img-fluid';
      div.appendChild(img);
    }
    img.src = data.image_url;
    img.style.maxHeight = '200px';
  } else {
    if (img) img.remove();
  }
});
