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
        e.target.closest(".invite-member, .open-chat-btn, .add-card-btn, .edit-project-btn")
    ) return;

    // wrapper, projectId, modal title/데이터 세팅
    const wrapper = card.closest('.project-card-wrapper');
    window.currentProjectId = wrapper.dataset.projectId;
    const modalElem = document.getElementById("projectBoardModal");
    modalElem.dataset.projectId = window.currentProjectId;
    document.getElementById("projectBoardTitle").textContent = card.querySelector(".card-title").textContent;
    document.getElementById("modalDeleteBtn").dataset.projectId = window.currentProjectId;
    document.getElementById("modalLeaveBtn").dataset.projectId = window.currentProjectId;
    document.getElementById("add-comment-btn").dataset.projectId = window.currentProjectId;
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
    const ddayBadge = wrapper.dataset.dDay || '';
    const dlElem = document.getElementById("modalDeadline");
    const ddElem = document.getElementById("modalDday");

    if (!deadlineText || deadlineText === '없음') {
      dlElem.textContent = '없음';
      ddElem.textContent = '';
      ddElem.classList.add('d-none');
    } else {
      dlElem.textContent = deadlineText;
      ddElem.textContent = ddayBadge;
      ddElem.classList.remove('d-none');

      if (ddayBadge === 'D-Day') {
        ddElem.className = 'badge bg-danger';
      } else if (ddayBadge.startsWith('D-')) {
        ddElem.className = 'badge bg-success';
      } else if (ddayBadge.startsWith('D+')) {
        ddElem.className = 'badge bg-secondary';
      } else {
        ddElem.className = 'badge bg-secondary';
      }
    }

    // 모달 띄우기
    const bsModal = new bootstrap.Modal(modalElem, { backdrop: 'static', keyboard: true });
    bsModal.show();

    // 1) 히스토리 최초 로드
    await loadComments(window.currentProjectId);
    await loadHistory(window.currentProjectId);

    // 2) 댓글 버튼 핸들러 등록
    const addCommentBtn = document.getElementById("add-comment-btn");
    addCommentBtn.onclick = async () => {
      console.log("모달 내 댓글 추가 버튼 클릭됨");
      const contentInput = document.getElementById('new-comment-content');
      const fileInput = document.getElementById('new-comment-image');
      const content = contentInput.value.trim();
      const projectId = modalElem.dataset.projectId;

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

        contentInput.value = '';
        fileInput.value = '';
        socket.emit("add_comment", {
          project_id: projectId,
          comment_id: responseData.id,
          content: content,
          image_url: responseData.image_url || null,
          author_id: currentUser.id,
          author_name: window.currentUserNickname
        });

        await loadComments(projectId);
      } catch (err) {
        console.error("댓글 추가 중 오류:", err);
        alert("댓글 추가 중 오류가 발생했습니다.");
      }
    };

    // 3) 댓글 리스트 이벤트 핸들러
    const commentList = document.getElementById('comment-list');
    const handleCommentClick = async (e) => {
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

      const projectId = modalElem.dataset.projectId;
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

      if (btn.classList.contains('edit-comment-btn')) {
        startInlineEdit(commentDiv);
      } else if (btn.classList.contains('save-comment-btn')) {
        console.log('Save button clicked for comment:', commentId);
        await saveInlineEdit(commentDiv, projectId);
      } else if (btn.classList.contains('cancel-comment-btn')) {
        cancelInlineEdit(commentDiv);
      } else if (btn.classList.contains('delete-comment-btn')) {
        if (confirm("정말 삭제할까요?")) {
          await deleteComment(commentId, projectId);
        }
      }
    };

    // 이벤트 리스너 추가
    commentList.addEventListener('click', handleCommentClick);

    // 모달이 닫힐 때 이벤트 리스너 제거
    modalElem.addEventListener('hidden.bs.modal', () => {
      commentList.removeEventListener('click', handleCommentClick);
      console.log('댓글 리스트 이벤트 리스너 제거됨');
    }, { once: true });

    // 4) 마감일 수정 버튼 클릭 시
    const editBtn = document.getElementById("editDeadlineBtn");
    editBtn.onclick = () => {
      if (editBtn.parentNode.querySelector('input[type="date"]')) return;

      const tmp = document.createElement('input');
      tmp.type = 'date';
      tmp.value = wrapper.dataset.deadline || '';
      tmp.style.marginLeft = '0.5rem';
      editBtn.parentNode.insertBefore(tmp, editBtn.nextSibling);

      tmp.focus();
      if (typeof tmp.showPicker === 'function') tmp.showPicker();

      tmp.onchange = async () => {
        const newDate = tmp.value;
        tmp.remove();

        const projectId = window.currentProjectId;
        let response;

        if (!newDate) {
          response = await fetch(`/projects/${projectId}/deadline`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deadline: null }),
            credentials: 'include'
          });
          const body = await response.json();
          if (!response.ok) {
            return alert(body.error || '업데이트 실패');
          }

          dlElem.textContent = '없음';
          ddElem.textContent = '';
          ddElem.classList.add('d-none');
          delete wrapper.dataset.deadline;
          delete wrapper.dataset.dDay;

          socket.emit('set_project_deadline', {
            project_id: projectId,
            deadline: null,
            user_id: currentUser.id,
            nickname: window.currentUserNickname
          });

          await loadHistory(projectId);
          const histList = document.getElementById("history-list");
          const histArrow = document.getElementById("history-arrow");
          if (!histList.classList.contains("open")) {
            histList.classList.add("open");
            histArrow.classList.replace("bi-caret-right-fill", "bi-caret-down-fill");
          }

          alert('마감일이 삭제되었습니다.');
          return;
        }

        response = await fetch(`/projects/${projectId}/deadline`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deadline: newDate }),
          credentials: 'include'
        });
        const body = await response.json();
        if (!response.ok) {
          return alert(body.error || '업데이트 실패');
        }

        dlElem.textContent = newDate;
        const today = dateOnly(new Date());
        const deadlineDate = dateOnly(newDate);
        const diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));

        if (diff > 0) {
          ddElem.textContent = `D-${diff}`;
          ddElem.classList.add('bg-success');
          ddElem.classList.remove('bg-danger', 'bg-secondary', 'bg-transparent');
          ddElem.classList.remove('d-none');
        } else if (diff === 0) {
          ddElem.textContent = 'D-Day';
          ddElem.classList.add('bg-danger');
          ddElem.classList.remove('bg-success', 'bg-secondary', 'bg-transparent');
          ddElem.classList.remove('d-none');
        } else {
          ddElem.textContent = `D+${Math.abs(diff)}`;
          ddElem.classList.add('bg-secondary');
          ddElem.classList.remove('bg-success', 'bg-danger', 'bg-transparent');
          ddElem.classList.remove('d-none');
        }
        ddElem.style.fontWeight = 'bold';

        wrapper.dataset.deadline = newDate;
        wrapper.dataset.dDay = ddElem.textContent;

        socket.emit('set_project_deadline', {
          project_id: projectId,
          deadline: newDate,
          user_id: currentUser.id,
          nickname: window.currentUserNickname
        });

        await loadHistory(projectId);
        alert('마감일이 업데이트되었습니다.');
      };
    };

    socket.on('set_project_deadline', async data => {
      console.log('set_project_deadline 이벤트 수신:', data);
      const modal = document.getElementById('projectBoardModal');
      const currentProjectId = modal?.dataset.projectId;

      if (!modal || data.project_id !== currentProjectId) {
        console.log('모달 없음 또는 프로젝트 ID 불일치:', {
          received: data.project_id,
          current: currentProjectId,
          modalExists: !!modal
        });
        return;
      }

      const dlElem = document.getElementById("modalDeadline");
      const ddElem = document.getElementById("modalDday");
      const wrapper = document.getElementById("deadline-wrapper");

      if (!dlElem || !ddElem || !wrapper) {
        console.warn('마감일 UI 요소를 찾을 수 없음:', {
          dlElemExists: !!dlElem,
          ddElemExists: !!ddElem,
          wrapperExists: !!wrapper
        });
        return;
      }

      if (!data.deadline) {
        dlElem.textContent = '없음';
        ddElem.textContent = '';
        ddElem.classList.add('d-none');
        delete wrapper.dataset.deadline;
        delete wrapper.dataset.dDay;
        console.log('마감일 삭제됨:', data.project_id);

        await loadHistory(data.project_id);
        return;
      }

      dlElem.textContent = data.deadline;
      const today = dateOnly(new Date());
      const deadlineDate = dateOnly(data.deadline);
      const diff = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));

      if (diff > 0) {
        ddElem.textContent = `D-${diff}`;
        ddElem.classList.add('bg-success');
        ddElem.classList.remove('bg-danger', 'bg-secondary', 'bg-transparent');
        ddElem.classList.remove('d-none');
      } else if (diff === 0) {
        ddElem.textContent = 'D-Day';
        ddElem.classList.add('bg-danger');
        ddElem.classList.remove('bg-success', 'bg-secondary', 'bg-transparent');
        ddElem.classList.remove('d-none');
      } else {
        ddElem.textContent = `D+${Math.abs(diff)}`;
        ddElem.classList.add('bg-secondary');
        ddElem.classList.remove('bg-success', 'bg-danger', 'bg-transparent');
        ddElem.classList.remove('d-none');
      }
      ddElem.style.fontWeight = 'bold';

      wrapper.dataset.deadline = data.deadline;
      wrapper.dataset.dDay = ddElem.textContent;
      console.log('마감일 업데이트됨:', { deadline: data.deadline, dDay: ddElem.textContent });

      await loadHistory(data.project_id);
    });

    loadCards();
    await loadHistory(window.currentProjectId);
  });

  isModalInitialized = true;
  console.log("모달 초기화가 완료되었습니다.");
}

function dateOnly(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

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
    removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'X';
    removeBtn.title = '이미지 삭제';
    removeBtn.className = 'btn btn-sm btn-danger ms-2 remove-img-btn';
    origImg.after(removeBtn);
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'form-control form-control-sm mt-2 d-none';
    div.appendChild(fileInput);

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
  saveBtn.type = 'button';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-secondary cancel-comment-btn';
  cancelBtn.textContent = '취소';
  cancelBtn.type = 'button';
  
  btnGroup.append(saveBtn, cancelBtn);
  div.appendChild(btnGroup);

  textarea.focus();
}

async function saveInlineEdit(div, projectId) {
  const commentId = div.dataset.id;
  const textarea = div.querySelector('textarea');
  const newText = textarea?.value.trim();

  const fileInput = div.querySelector('input[type=file]');
  const hasImage = fileInput && fileInput.files.length > 0;
  const isImageRemoved = div.classList.contains('remove-image');

  if (!newText && !hasImage && !isImageRemoved) {
    return alert('댓글 내용을 입력하거나 이미지를 추가/삭제하세요.');
  }

  let res;
  try {
    let responseData;
    if (hasImage || isImageRemoved) {
      const formData = new FormData();
      formData.append('content', newText);
      if (hasImage) formData.append('image', fileInput.files[0]);
      if (isImageRemoved) formData.append('delete_image', '1');

      console.log('이미지 업로드/삭제 요청:', {
        hasImage,
        isImageRemoved,
        content: newText,
        file: hasImage ? fileInput.files[0].name : null
      });

      res = await fetch(`/comments/${commentId}`, {
        method: 'PUT',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`댓글 저장 실패: ${res.status}`);

      responseData = await res.json();
      console.log('PUT API 응답:', responseData);

      socket.emit('edit_comment', {
        project_id: projectId,
        comment_id: commentId,
        content: newText,
        image_url: responseData.image_url || null,
        delete_image: isImageRemoved ? '1' : '0',
        author_id: currentUser.id,
        author_name: currentUser.name
      });

      console.log('edit_comment 이벤트 전송:', {
        project_id: projectId,
        comment_id: commentId,
        content: newText,
        image_url: responseData.image_url || null,
        delete_image: isImageRemoved ? '1' : '0'
      });

      await loadComments(projectId);
    } else {
      res = await fetch(`/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newText }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(`댓글 저장 실패: ${res.status}`);

      responseData = await res.json();
      console.log('PUT API 응답:', responseData);

      socket.emit('edit_comment', {
        project_id: projectId,
        comment_id: commentId,
        content: newText,
        image_url: null,
        delete_image: '0',
        author_id: currentUser.id,
        author_name: currentUser.name
      });

      console.log('edit_comment 이벤트 전송:', {
        project_id: projectId,
        comment_id: commentId,
        content: newText,
        image_url: null,
        delete_image: '0'
      });

      const contentSpan = div.querySelector('.comment-content');
      if (contentSpan) {
        contentSpan.textContent = newText;
        contentSpan.style.display = '';
      }
    }

    cancelInlineEdit(div);
  } catch (error) {
    console.error('댓글 저장 오류:', error);
    alert('댓글 저장 중 오류가 발생했습니다.');
  }
}

function cancelInlineEdit(div) {
  div.querySelectorAll(
    'textarea, .form-check, .save-comment-btn, .cancel-comment-btn, input[type=file]'
  ).forEach(el => el.remove());

  div.querySelector('.comment-content').style.display = '';

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
    socket.emit('delete_comment', {
      project_id: projectId,
      comment_id: commentId
    });

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
      const commentId = comment.id || comment._id;
      
      list.innerHTML += `
        <div class="comment mb-2" data-id="${commentId}">
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